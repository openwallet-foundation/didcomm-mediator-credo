import { randomUUID } from 'node:crypto'
import * as os from 'node:os'
import { Agent, AgentContext, EventEmitter, Logger } from '@credo-ts/core'
import {
  AddMessageOptions,
  DidCommMessagePickupApi,
  DidCommMessagePickupEventTypes,
  DidCommMessagePickupLiveSessionSavedEvent,
  DidCommMessagePickupSession,
  DidCommMessagePickupSessionRole,
  DidCommQueueTransportRepository,
  GetAvailableMessageCountOptions,
  MessagePickupLiveSessionRemovedEvent,
  QueuedDidCommMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/didcomm'
import { Pool } from 'pg'
import PGPubsub from 'pg-pubsub'
import {
  ExtendedMessagePickupSession,
  PostgresMessageQueuedEvent,
  PostgresMessageQueuedEventType,
  PostgresTransportQueuePostgresConfig,
} from './interfaces.js'
import { buildPgDatabaseWithMigrations } from './utils/buildPgDatabaseWithMigrations.js'

// Arbitrary but stable key used for the reaper's advisory lock. Chosen so it
// is unlikely to collide with advisory locks used elsewhere in the same DB.
const REAPER_ADVISORY_LOCK_KEY = 814200381

export class DidCommTransportQueuePostgres implements DidCommQueueTransportRepository {
  private logger?: Logger
  private messagesCollection?: Pool
  private pubSubInstance: PGPubsub
  private instanceName: string
  private postgresUser: string
  private postgresPassword: string
  private postgresHost: string
  private postgresDatabaseName: string

  private heartbeatIntervalMs: number
  private instanceTimeoutMs: number
  private reaperIntervalMs: number
  private heartbeatTimer?: NodeJS.Timeout
  private reaperTimer?: NodeJS.Timeout
  // LiveSessionRemoved can fire before the LiveSessionSaved insert for the same session has landed
  private pendingLiveSessionInserts = new Map<string, Promise<void>>()

  public constructor(options: PostgresTransportQueuePostgresConfig) {
    const {
      logger,
      postgresUser,
      postgresPassword,
      postgresHost,
      postgresDatabaseName,
      heartbeatIntervalMs,
      instanceTimeoutMs,
      reaperIntervalMs,
    } = options

    this.logger = logger
    this.postgresUser = postgresUser
    this.postgresPassword = postgresPassword
    this.postgresHost = postgresHost
    this.postgresDatabaseName = postgresDatabaseName || 'messagepickuprepository'

    this.heartbeatIntervalMs = heartbeatIntervalMs ?? 10_000
    this.instanceTimeoutMs = instanceTimeoutMs ?? 60_000
    this.reaperIntervalMs = reaperIntervalMs ?? 30_000

    if (this.instanceTimeoutMs <= this.heartbeatIntervalMs) {
      this.logger?.warn(
        `[initialize] instanceTimeoutMs (${this.instanceTimeoutMs}) should be significantly larger than heartbeatIntervalMs (${this.heartbeatIntervalMs}); otherwise transient latency may cause live instances to be considered dead.`
      )
    }

    // Initialize instanceName
    this.instanceName = `${os.hostname()}-${process.pid}-${randomUUID()}`
    this.logger?.info(`[initialize] Instance identifier set to: ${this.instanceName}`)

    // Initialize Pub/Sub instance if database listener is enabled
    this.logger?.debug('[initialize] Initializing pubSubInstance')
    this.pubSubInstance = new PGPubsub(
      `postgres://${postgresUser}:${postgresPassword}@${postgresHost}/${postgresDatabaseName}`
    )
  }

  /**
   * Initializes the service by setting up the database, message listeners, and the agent.
   * This method also configures the Pub/Sub system and registers event handlers.
   *
   * @returns {Promise<void>} A promise that resolves when the initialization is complete.
   * @throws {Error} Throws an error if initialization fails due to database, Pub/Sub, or agent setup issues.
   */
  public async initialize(agent: Agent): Promise<void> {
    try {
      // Initialize the database
      await buildPgDatabaseWithMigrations(
        this.logger,
        {
          user: this.postgresUser,
          password: this.postgresPassword,
          host: this.postgresHost,
        },
        this.postgresDatabaseName
      )
      this.logger?.info('[initialize] The database has been build successfully')

      // Configure PostgreSQL pool for the messages collections
      this.messagesCollection = new Pool({
        user: this.postgresUser,
        password: this.postgresPassword,
        host: this.postgresHost,
        database: this.postgresDatabaseName,
        port: 5432,
      })

      // Initialize Listener PUB/SUB
      await this.initializeMessageListener(agent.context, 'newMessage')

      // Register this instance in the heartbeat table BEFORE running the reaper,
      // so a concurrent reaper on another pod cannot misclassify us as dead.
      await this.heartbeat(agent.context)

      // Proactively reap any live_session rows belonging to dead instances (including
      // our own previous incarnations: our randomUUID-scoped instanceName is fresh,
      // so any rows carrying a previous pod's identity are by definition stale).
      // This also recovers rows left behind by crashes that never ran `shutdown`.
      try {
        await this.reapStaleInstances(agent.context)
      } catch (reapError) {
        agent.context.config.logger.warn(`[initialize] Startup reaper pass failed: ${reapError}`)
      }

      // Start periodic heartbeat + reaper timers. The reaper uses a Postgres advisory
      // lock so only one surviving instance actually executes the reap per tick.
      this.heartbeatTimer = setInterval(() => {
        this.heartbeat(agent.context).catch((err) => agent.context.config.logger.warn(`[heartbeat] Failed: ${err}`))
      }, this.heartbeatIntervalMs)
      this.heartbeatTimer.unref?.()

      this.reaperTimer = setInterval(() => {
        this.reapStaleInstances(agent.context).catch((err) =>
          agent.context.config.logger.warn(`[reaper] Failed: ${err}`)
        )
      }, this.reaperIntervalMs)
      this.reaperTimer.unref?.()

      // Register event handlers
      agent.events.on(
        DidCommMessagePickupEventTypes.LiveSessionRemoved,
        async (data: MessagePickupLiveSessionRemovedEvent) => {
          const { id: sessionId, connectionId } = data.payload.session
          agent.context.config.logger.info(
            `*** Session removed for connectionId: ${connectionId} (sessionId: ${sessionId}) ***`
          )

          try {
            // Only revive 'sending' messages back to 'pending' if WE actually owned the
            // live_session row that is being removed. Otherwise we would race against
            // another instance that legitimately took ownership of this connection's
            // pickup session and is currently delivering, causing duplicate delivery.
            await this.pendingLiveSessionInserts.get(sessionId)
            const removed = await this.removeLiveSessionOnDb(agent.context, sessionId)
            if (removed) {
              await this.checkQueueMessages(agent.context, connectionId, this.instanceName)
            } else {
              agent.context.config.logger.debug(
                `[LiveSessionRemoved] No live_session row owned by this instance (${this.instanceName}) for sessionId ${sessionId}; skipping checkQueueMessages to avoid racing the owning instance.`
              )
            }
          } catch (handlerError) {
            agent.context.config.logger.error(`Error handling LiveSessionRemoved: ${handlerError}`)
          }
        }
      )

      agent.events.on(
        DidCommMessagePickupEventTypes.LiveSessionSaved,
        async (data: DidCommMessagePickupLiveSessionSavedEvent) => {
          const liveSessionData = data.payload.session
          agent.context.config.logger.info(`*** Session saved for connectionId: ${liveSessionData.connectionId} ***`)

          const insert = this.addLiveSessionOnDb(agent.context, liveSessionData, this.instanceName)
          this.pendingLiveSessionInserts.set(liveSessionData.id, insert)
          try {
            await insert
          } catch (handlerError) {
            agent.context.config.logger.error(`Error handling LiveSessionSaved: ${handlerError}`)
          } finally {
            this.pendingLiveSessionInserts.delete(liveSessionData.id)
          }
        }
      )
    } catch (error) {
      agent.context.config.logger.error(`[initialize] Initialization failed: ${error}`)
      throw new Error(`Failed to initialize the service: ${error}`)
    }
  }

  /**
   * Fetches messages from the queue based on the specified options.
   *
   * @param {TakeFromQueueOptions} options - The options for fetching messages.
   * @param {string} options.connectionId - The ID of the connection.
   * @param {number} [options.limit] - The maximum number of messages to fetch.
   * @param {boolean} options.deleteMessages - Whether to delete messages after retrieval.
   * @param {string} options.recipientDid - The DID of the recipient.
   * @returns {Promise<QueuedMessage[]>} A promise resolving to an array of queued messages.
   */
  public async takeFromQueue(
    agentContext: AgentContext,
    options: TakeFromQueueOptions
  ): Promise<QueuedDidCommMessage[]> {
    const { connectionId, limit, deleteMessages, recipientDid } = options
    agentContext.config.logger.info(
      `[takeFromQueue] Initializing method for ConnectionId: ${connectionId}, Limit: ${limit}`
    )

    try {
      // If deleteMessages is true, just fetch messages without updating their state
      if (deleteMessages) {
        const query = `
        SELECT id, encrypted_message, state, created_at 
        FROM queued_message 
        WHERE (connection_id = $1 OR $2 = ANY (recipient_dids)) AND state = 'pending' 
        ORDER BY created_at 
        LIMIT $3
      `
        const params = [connectionId, recipientDid, limit ?? 0]
        const result = await this.messagesCollection?.query(query, params)

        if (!result || result.rows.length === 0) {
          agentContext.config.logger.debug(`[takeFromQueue] No messages found for ConnectionId: ${connectionId}`)
          return []
        }

        return result.rows.map((message) => ({
          id: message.id,
          encryptedMessage: message.encrypted_message,
          receivedAt: new Date(message.created_at),
          state: message.state,
        }))
      }

      // Use UPDATE and RETURNING to fetch and update messages in one step
      const query = `
      UPDATE queued_message
      SET state = 'sending', instance = $4
      WHERE id IN (
        SELECT id 
        FROM queued_message 
        WHERE (connection_id = $1 OR $2 = ANY (recipient_dids)) 
        AND state = 'pending' 
        ORDER BY created_at 
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, encrypted_message, state, created_at;
    `
      const params = [connectionId, recipientDid, limit ?? 0, this.instanceName]
      const result = await this.messagesCollection?.query(query, params)

      if (!result || result.rows.length === 0) {
        agentContext.config.logger.debug(`[takeFromQueue] No messages updated for ConnectionId: ${connectionId}`)
        return []
      }

      agentContext.config.logger.debug(`[takeFromQueue] ${result.rows.length} messages updated to "sending" state.`)

      // Return the messages as QueuedMessage objects
      return result.rows.map((message) => ({
        id: message.id,
        encryptedMessage: message.encrypted_message,
        receivedAt: new Date(message.created_at),
        state: 'sending',
      }))
    } catch (error) {
      agentContext.config.logger.error(`[takeFromQueue] Error: ${error}`)
      return []
    }
  }

  /**
   * Retrieves the count of available messages in the queue for a given connection.
   *
   * @param {GetAvailableMessageCountOptions} options - Options for retrieving the message count.
   * @param {string} options.connectionId - The ID of the connection to check.
   * @returns {Promise<number>} A promise resolving to the count of available messages.
   */
  public async getAvailableMessageCount(
    agentContext: AgentContext,
    options: GetAvailableMessageCountOptions
  ): Promise<number> {
    const { connectionId } = options
    agentContext.config.logger.debug(`[getAvailableMessageCount] Initializing method for ConnectionId: ${connectionId}`)

    try {
      // Query to count pending messages for the specified connection ID
      const query = `
      SELECT COUNT(*) AS count 
      FROM queued_message 
      WHERE connection_id = $1 AND state = 'pending'
    `
      const params = [connectionId]
      const result = await this.messagesCollection?.query(query, params)

      if (!result || result.rows.length === 0) {
        agentContext.config.logger.debug(
          `[getAvailableMessageCount] No pending messages found for ConnectionId: ${connectionId}`
        )
        return 0
      }

      // Parse the count result
      const numberMessage = Number.parseInt(result.rows[0].count, 10)
      agentContext.config.logger.debug(`[getAvailableMessageCount] Count of available messages: ${numberMessage}`)

      return numberMessage
    } catch (error) {
      agentContext.config.logger.error(`[getAvailableMessageCount] Error while retrieving message count: ${error}`)
      return 0
    }
  }

  /**
   * Adds a new message to the queue and processes it based on live session status.
   *
   * @param {AddMessageOptions} options - The options for adding a message.
   * @param {string} options.connectionId - The ID of the connection.
   * @param {string[]} options.recipientDids - Recipient DIDs for the message.
   * @param {string} options.payload - The encrypted message payload.
   * @returns {Promise<string> }- A promise resolving to the messageId and receivedAt of the added message.
   * @throws {Error} Throws an error if the agent is not defined or if an error occurs during message insertion or processing.
   */
  public async addMessage(agentContext: AgentContext, options: AddMessageOptions): Promise<string> {
    const { connectionId, recipientDids, payload } = options
    agentContext.config.logger.debug(`[addMessage] Initializing new message for connectionId: ${connectionId}`)
    const receivedAt = new Date()

    if (!this.messagesCollection) {
      throw new Error('messagesCollection is not defined')
    }

    try {
      // Retrieve local live session details
      const localLiveSession = await this.findLocalLiveSession(agentContext, connectionId)

      // Insert message into database
      const query = `
        INSERT INTO queued_message(connection_id, recipient_dids, encrypted_message, state, created_at, instance) 
        VALUES($1, $2, $3, $4, $5, $6) 
        RETURNING id
      `

      const state = localLiveSession ? 'sending' : 'pending'

      const result = await this.messagesCollection.query(query, [
        connectionId,
        recipientDids,
        payload,
        state,
        receivedAt,
        localLiveSession ? this.instanceName : null,
      ])

      const messageRecord = result?.rows[0]

      this.logger?.debug(
        `[addMessage] Message added with ID: ${messageRecord.id}, receivedAt: ${receivedAt.toISOString()} for connectionId: ${connectionId}`
      )
      // Verify if a live session exists in DB (other instances)
      const liveSessionInPostgres = await this.findLiveSessionInDb(agentContext, connectionId)

      // Always emit MessageQueued event with complete payload
      await this.emitMessageQueuedEvent(agentContext, {
        message: {
          id: messageRecord.id,
          connectionId,
          recipientDids,
          encryptedMessage: payload,
          receivedAt,
          state,
        },
        session: localLiveSession || liveSessionInPostgres || undefined,
      })

      if (localLiveSession) {
        agentContext.config.logger.debug(`[addMessage] Local live session exists for connectionId: ${connectionId}`)

        const messagePickupApi = agentContext.resolve(DidCommMessagePickupApi)
        await messagePickupApi.deliverMessages({
          pickupSessionId: localLiveSession.id,
          messages: [{ id: messageRecord.id, encryptedMessage: payload, receivedAt }],
        })
      } else if (liveSessionInPostgres) {
        agentContext.config.logger.debug(
          `[addMessage] Publishing new message event to Pub/Sub channel for connectionId: ${connectionId}`
        )

        await this.pubSubInstance.publish('newMessage', connectionId)
      }

      return messageRecord.id
    } catch (error) {
      agentContext.config.logger.error(`[addMessage] Error during message insertion or processing: ${error}`)
      throw new Error(`Failed to add message: ${error}`)
    }
  }

  /**
   * Removes specified messages from the queue for a given connection.
   *
   * @param {RemoveMessagesOptions} options - Options for removing messages.
   * @param {string} options.connectionId - The ID of the connection.
   * @param {string[]} options.messageIds - Array of message IDs to be removed.
   * @returns {Promise<void>} A promise resolving when the operation completes.
   */
  public async removeMessages(agentContext: AgentContext, options: RemoveMessagesOptions): Promise<void> {
    const { connectionId, messageIds } = options
    agentContext.config.logger.debug(
      `[removeMessages] Attempting to remove messages with IDs: ${messageIds} for ConnectionId: ${connectionId}`
    )

    // Validate messageIds
    if (!messageIds || messageIds.length === 0) {
      agentContext.config.logger.debug('[removeMessages] No message IDs provided. No messages will be removed.')
      return
    }

    try {
      // Generate placeholders for the SQL query dynamically based on messageIds length
      const placeholders = messageIds.map((_, index) => `$${index + 2}`).join(', ')

      // Construct the SQL DELETE query
      const query = `DELETE FROM queued_message WHERE connection_id = $1 AND id IN (${placeholders})`

      // Combine connectionId with messageIds as query parameters
      const queryParams = [connectionId, ...messageIds]

      // Execute the query
      await this.messagesCollection?.query(query, queryParams)

      agentContext.config.logger.debug(
        `[removeMessages] Successfully removed messages with IDs: ${messageIds} for ConnectionId: ${connectionId}`
      )
    } catch (error) {
      agentContext.config.logger.error(`[removeMessages] Error occurred while removing messages: ${error}`)
      throw new Error(`Failed to remove messages: ${error}`)
    }
  }

  public async shutdown(agentContext: AgentContext) {
    agentContext.config.logger.info('[shutdown] Stopping heartbeat/reaper timers and releasing this instance')

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer)
      this.reaperTimer = undefined
    }

    // Best-effort graceful handoff: release any live_session rows we still own and
    // wake up whichever instance may hold (or later reconnect on) each connection.
    // We don't rely on this — the reaper will catch anything we miss — but it
    // keeps the DB clean on controlled shutdowns and avoids waiting instanceTimeoutMs.
    try {
      const ownRows = await this.messagesCollection?.query<{ connection_id: string }>(
        'DELETE FROM live_session WHERE instance = $1 RETURNING connection_id',
        [this.instanceName]
      )
      const connectionIds = ownRows?.rows.map((r) => r.connection_id) ?? []
      for (const connectionId of connectionIds) {
        await this.checkQueueMessages(agentContext, connectionId, this.instanceName)
      }
    } catch (cleanupError) {
      agentContext.config.logger.warn(`[shutdown] Failed releasing own live_session rows: ${cleanupError}`)
    }

    try {
      await this.messagesCollection?.query('DELETE FROM instance WHERE name = $1', [this.instanceName])
    } catch (cleanupError) {
      agentContext.config.logger.warn(`[shutdown] Failed removing own instance row: ${cleanupError}`)
    }

    agentContext.config.logger.info('[shutdown] Close connection to postgres')
    await this.messagesCollection?.end()
  }

  /**
   * Subscribes to a specific Pub/Sub channel and handles incoming messages.
   *
   * @param {string} channel - The name of the channel to subscribe to.
   * @returns {Promise<void>} A promise resolving when the listener is initialized.
   */
  private async initializeMessageListener(agentContext: AgentContext, channel: string): Promise<void> {
    agentContext.config.logger.info(`[initializeMessageListener] Initializing method for channel: ${channel}`)

    try {
      // Add a listener to the specified Pub/Sub channel
      await this.pubSubInstance.addChannel(channel, async (connectionId: string) => {
        agentContext.config.logger.debug(
          `[initializeMessageListener] Received new message on channel: ${channel} for connectionId: ${connectionId}`
        )

        // Fetch the local live session for the given connectionId
        const pickupLiveSession = await this.findLocalLiveSession(agentContext, connectionId)

        if (pickupLiveSession) {
          agentContext.config.logger.debug(
            `[initializeMessageListener] ${this.instanceName} found a LiveSession on channel: ${channel} for connectionId: ${connectionId}. Delivering messages.`
          )

          const messagePickupApi = agentContext.resolve(DidCommMessagePickupApi)
          // Deliver messages from the queue for the live session
          await messagePickupApi.deliverMessagesFromQueue({
            pickupSessionId: pickupLiveSession.id,
          })
        } else {
          agentContext.config.logger.debug(
            `[initializeMessageListener] No LiveSession found on channel: ${channel} for connectionId: ${connectionId}.`
          )
        }
      })

      agentContext.config.logger.info(`[initializeMessageListener] Listener successfully added for channel: ${channel}`)
    } catch (error) {
      agentContext.config.logger.error(
        `[initializeMessageListener] Error initializing listener for channel ${channel}: ${error}`
      )
      throw new Error(`Failed to initialize listener for channel ${channel}: ${error}`)
    }
  }

  /**
   * Upserts the heartbeat row for this instance. Called once at startup and then on
   * a timer every `heartbeatIntervalMs`. The reaper on any instance considers us
   * alive as long as `instance.last_seen` is newer than `now() - instanceTimeoutMs`.
   */
  private async heartbeat(agentContext: AgentContext): Promise<void> {
    try {
      await this.messagesCollection?.query(
        `INSERT INTO instance (name, last_seen) VALUES ($1, now())
         ON CONFLICT (name) DO UPDATE SET last_seen = now()`,
        [this.instanceName]
      )
    } catch (error) {
      agentContext.config.logger.warn(`[heartbeat] Failed to upsert instance row: ${error}`)
    }
  }

  /**
   * Deletes `live_session` rows owned by instances that are either absent from the
   * `instance` table entirely (e.g. pre-heartbeat legacy rows, or rows orphaned by
   * an instance that was deleted but whose live_session rows were missed) or whose
   * last heartbeat is older than `instanceTimeoutMs`.
   *
   * For every connection whose live session was reaped, we revive any queued
   * messages stuck in `sending` back to `pending` and publish to the `newMessage`
   * pub/sub channel so that an instance currently owning a (possibly new) live
   * session for the same connection drains them immediately. If no such owner
   * exists, the next forward addressed to that connection will correctly observe
   * no live session, triggering a push notification via the downstream consumer.
   *
   * Runs under a Postgres session-level advisory lock so only one instance does
   * the reap per tick across the cluster. Other instances simply skip this tick.
   */
  private async reapStaleInstances(agentContext: AgentContext): Promise<void> {
    if (!this.messagesCollection) return

    const client = await this.messagesCollection.connect()
    try {
      const lockResult = await client.query<{ pg_try_advisory_lock: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock',
        [REAPER_ADVISORY_LOCK_KEY]
      )
      const acquired = lockResult.rows[0]?.pg_try_advisory_lock === true
      if (!acquired) {
        agentContext.config.logger.trace?.('[reaper] Another instance holds the reaper lock; skipping tick.')
        return
      }

      try {
        // Delete live_session rows whose instance is either unknown or stale.
        // Exclude our own instance as a belt-and-suspenders guard: we're alive by
        // definition, even if our heartbeat row were somehow missing transiently.
        const reaped = await client.query<{ connection_id: string; session_id: string; instance: string }>(
          `DELETE FROM live_session ls
             WHERE ls.instance <> $1
               AND NOT EXISTS (
                 SELECT 1 FROM instance i
                  WHERE i.name = ls.instance
                    AND i.last_seen >= now() - ($2::bigint * interval '1 millisecond')
               )
           RETURNING ls.connection_id, ls.session_id, ls.instance`,
          [this.instanceName, this.instanceTimeoutMs]
        )

        // Drop the heartbeat rows of the now-dead instances (again excluding ourselves).
        await client.query(
          `DELETE FROM instance
             WHERE name <> $1
               AND last_seen < now() - ($2::bigint * interval '1 millisecond')`,
          [this.instanceName, this.instanceTimeoutMs]
        )

        if (reaped.rowCount && reaped.rowCount > 0) {
          const staleInstances = new Set(reaped.rows.map((r) => r.instance))
          agentContext.config.logger.info(
            `[reaper] Reaped ${reaped.rowCount} live_session row(s) from ${staleInstances.size} dead instance(s): ${[...staleInstances].join(', ')}`
          )

          // Wake up current owners (if any) and revive any stuck 'sending' messages.
          // Dedupe in case an instance had multiple rows for one connection.
          const reapedOwners = new Map(reaped.rows.map((r) => [`${r.connection_id} ${r.instance}`, r]))
          for (const { connection_id, instance } of reapedOwners.values()) {
            await this.checkQueueMessages(agentContext, connection_id, instance)
          }
        } else {
          agentContext.config.logger.debug('[reaper] No stale live_session rows to reap.')
        }
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [REAPER_ADVISORY_LOCK_KEY])
      }
    } catch (error) {
      agentContext.config.logger.error(`[reaper] Error during reap: ${error}`)
    } finally {
      client.release()
    }
  }

  /**
   * Reverts 'sending' messages for the given connectionId back to 'pending' (typically after a
   * LiveSessionRemoved event on the instance that owned the session). Messages that another
   * instance is delivering on its own live session for this connection are left alone, so they
   * are not delivered twice. Rows with no instance predate migration 003. If any rows were
   * reverted and another instance currently owns a live session for that connection, we publish
   * to the 'newMessage' pub/sub channel so the owner wakes up and drains the queue immediately.
   *
   * Without this notification, reverted messages would remain stuck as 'pending' on the DB
   * until an unrelated event (a new forward arriving at the owning instance, or via pubsub
   * from a third instance) caused `deliverMessagesFromQueue` to run. In a two-pod migration
   * scenario where a forward landed on the old pod just before its WebSocket close fired,
   * that message could otherwise be delivered with arbitrary delay.
   */
  private async checkQueueMessages(agentContext: AgentContext, connectionId: string, instance: string): Promise<void> {
    try {
      agentContext.config.logger.debug(`[checkQueueMessages] Init verify messages state 'sending'`)
      const result = await this.messagesCollection?.query(
        `UPDATE queued_message qm SET state = 'pending', instance = NULL
         WHERE qm.state = 'sending' AND qm.connection_id = $1
           AND (qm.instance = $2 OR qm.instance IS NULL OR NOT EXISTS (
             SELECT 1 FROM live_session ls WHERE ls.connection_id = qm.connection_id::text AND ls.instance = qm.instance
           ))
         RETURNING qm.id`,
        [connectionId, instance]
      )
      const revertedCount = result?.rowCount ?? 0

      if (revertedCount > 0) {
        agentContext.config.logger.debug(
          `[checkQueueMessages] ${revertedCount} messages reverted to 'pending' for connectionId ${connectionId}.`
        )

        // Notify any other instance currently owning a live session for this connection so
        // it can pick up the reverted messages without waiting for a new forward.
        try {
          await this.pubSubInstance.publish('newMessage', connectionId)
        } catch (publishError) {
          agentContext.config.logger.warn(
            `[checkQueueMessages] Failed to publish 'newMessage' for connectionId ${connectionId}: ${publishError}`
          )
        }
      } else {
        agentContext.config.logger.debug('[checkQueueMessages] No messages in "sending" state.')
      }
    } catch (error) {
      agentContext.config.logger.error(`[checkQueueMessages] Error processing messages: ${error}`)
    }
  }

  /**
   * Get current active live mode message pickup session for a given connection
   * @param connectionId
   * @returns
   */
  private async findLocalLiveSession(
    agentContext: AgentContext,
    connectionId: string
  ): Promise<ExtendedMessagePickupSession | undefined> {
    agentContext.config.logger.debug(
      `[findLocalLiveSession] Verify current active live mode for connectionId ${connectionId}`
    )

    try {
      const messagePickupApi = agentContext.resolve(DidCommMessagePickupApi)
      const localSession = await messagePickupApi.getLiveModeSession({ connectionId })

      return localSession ? { ...localSession, isLocalSession: true } : undefined
    } catch (error) {
      agentContext.config.logger.error(`[findLocalLiveSession] error in getLocalliveSession: ${error}`)
    }
  }

  /**
   * This method allow find record into DB to determine if the connectionID has a liveSession in another instance
   * @param connectionId
   * @returns liveSession object or false
   */
  private async findLiveSessionInDb(
    agentContext: AgentContext,
    connectionId: string
  ): Promise<ExtendedMessagePickupSession | undefined> {
    agentContext.config.logger.debug(
      `[findLiveSessionInDb] initializing find registry for connectionId ${connectionId}`
    )
    if (!connectionId) throw new Error('connectionId is not defined')
    try {
      const queryLiveSession = await this.messagesCollection?.query(
        'SELECT session_id, connection_id, protocol_version FROM live_session WHERE connection_id = $1 LIMIT $2',
        [connectionId, 1]
      )
      // Check if liveSession is not empty (record found)
      const recordFound = queryLiveSession?.rows && queryLiveSession.rows.length > 0
      agentContext.config.logger.debug(
        `[findLiveSessionInDb] record found status ${recordFound} to connectionId ${connectionId}`
      )
      return recordFound
        ? { ...queryLiveSession.rows[0], role: DidCommMessagePickupSessionRole.MessageHolder, isLocalSession: false }
        : undefined
    } catch (_error) {
      agentContext.config.logger.debug(`[findLiveSessionInDb] Error find to connectionId ${connectionId}`)
      return undefined // Return false in case of an error
    }
  }

  /**
   * This method adds a new connectionId and instance name to DB upon LiveSessionSave event
   * @param connectionId
   * @param instance
   */
  private async addLiveSessionOnDb(
    agentContext: AgentContext,
    session: DidCommMessagePickupSession,
    instance: string
  ): Promise<void> {
    const { id, connectionId, protocolVersion } = session
    agentContext.config.logger.debug(
      `[addLiveSessionOnDb] initializing add LiveSession DB to connectionId ${connectionId}`
    )
    if (!session) throw new Error('session is not defined')
    try {
      const insertMessageDB = await this.messagesCollection?.query(
        'INSERT INTO live_session (session_id, connection_id, protocol_version, instance) VALUES($1, $2, $3, $4) RETURNING session_id',
        [id, connectionId, protocolVersion, instance]
      )
      const liveSessionId: DidCommMessagePickupSession['id'] = insertMessageDB?.rows[0].session_id
      this.logger?.debug(
        `[addLiveSessionOnDb] add liveSession to liveSessionId ${liveSessionId} to connectionId ${connectionId}`
      )
    } catch (_error) {
      agentContext.config.logger.debug(`[addLiveSessionOnDb] error add liveSession DB ${connectionId}`)
    }
  }

  /**
   * Removes the live_session row corresponding to the given pickup session id, scoped
   * to this instance so we never delete rows owned by another mediator pod.
   *
   * Multiple live_session rows can legitimately coexist for the same connection_id
   * during a session migration between pods (the new owner inserts its row before the
   * old owner's WebSocket close fires LiveSessionRemoved). Deleting by connection_id
   * would wipe out the still-active row on the new owner, leaving forwarded messages
   * with `session = undefined` in addMessage — no pubsub publish, no live delivery,
   * and (downstream) a spurious push notification.
   *
   * @returns true if a row was deleted (i.e. we did own a live session for this id)
   */
  private async removeLiveSessionOnDb(agentContext: AgentContext, sessionId: string): Promise<boolean> {
    agentContext.config.logger.debug(`[removeLiveSessionOnDb] initializing remove LiveSession sessionId ${sessionId}`)
    if (!sessionId) throw new Error('sessionId is not defined')
    try {
      const result = await this.messagesCollection?.query(
        'DELETE FROM live_session WHERE session_id = $1 AND instance = $2 RETURNING session_id',
        [sessionId, this.instanceName]
      )
      const removed = (result?.rowCount ?? 0) > 0
      agentContext.config.logger.debug(
        `[removeLiveSessionOnDb] removed=${removed} LiveSession sessionId ${sessionId} instance ${this.instanceName}`
      )
      return removed
    } catch (error) {
      agentContext.config.logger.error(`[removeLiveSessionOnDb] Error removing LiveSession: ${error}`)
      return false
    }
  }

  /**
   * Emits a MessageQueuedEvent using the agent's EventEmitter.
   *
   * @param {object} options - Event payload containing at least connectionId and messageId.
   * @param {string} options.connectionId - The connection identifier.
   * @param {string} options.messageId - The message identifier.
   * @param {any} [options.*] - Additional optional properties for the event payload.
   * @throws {Error} Throws if the agent is not initialized.
   */
  private async emitMessageQueuedEvent(agentContext: AgentContext, options: PostgresMessageQueuedEvent['payload']) {
    const { message, session } = options

    agentContext.config.logger.debug(
      `[emitMessageQueuedEvent] Emitting MessageQueuedEvent for connectionId: ${options.message.connectionId}, messageId: ${options.message.id}`
    )

    const eventEmitter = agentContext.resolve(EventEmitter)
    eventEmitter.emit<PostgresMessageQueuedEvent>(agentContext, {
      type: PostgresMessageQueuedEventType,
      payload: {
        message,
        session,
      },
    })
  }
}
