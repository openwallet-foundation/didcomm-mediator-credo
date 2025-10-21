import { randomUUID } from 'node:crypto'
import * as os from 'node:os'
import {
  AddMessageOptions,
  Agent,
  GetAvailableMessageCountOptions,
  Logger,
  MessagePickupEventTypes,
  MessagePickupLiveSessionRemovedEvent,
  MessagePickupLiveSessionSavedEvent,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
  injectable,
} from '@credo-ts/core'
import {
  MessagePickupSession,
  MessagePickupSessionRole,
} from '@credo-ts/core/build/modules/message-pickup/MessagePickupSession'
import { Pool } from 'pg'
import PGPubsub from 'pg-pubsub'
import {
  ExtendedMessagePickupSession,
  MessageQueuedEvent,
  MessageQueuedEventType,
  PostgresMessagePickupRepositoryConfig,
} from './interfaces'
import { buildPgDatabaseWithMigrations } from './utils/buildPgDatabaseWithMigrations'

@injectable()
export class PostgresMessagePickupRepository implements MessagePickupRepository {
  private logger?: Logger
  private messagesCollection?: Pool
  private agent?: Agent
  private pubSubInstance: PGPubsub
  private instanceName: string
  private postgresUser: string
  private postgresPassword: string
  private postgresHost: string
  private postgresDatabaseName: string

  public constructor(options: PostgresMessagePickupRepositoryConfig) {
    const { logger, postgresUser, postgresPassword, postgresHost, postgresDatabaseName } = options

    this.logger = logger
    this.postgresUser = postgresUser
    this.postgresPassword = postgresPassword
    this.postgresHost = postgresHost
    this.postgresDatabaseName = postgresDatabaseName || 'messagepickuprepository'

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
   * @param {Agent} agent - The agent instance to be initialized.
   * @param {(connectionId: string) => Promise<ConnectionInfo | undefined>} connectionInfoCallback -
   * A callback function that retrieves connection information for a given connection ID.
   * @returns {Promise<void>} A promise that resolves when the initialization is complete.
   * @throws {Error} Throws an error if initialization fails due to database, Pub/Sub, or agent setup issues.
   */
  public async initialize(options: { agent: Agent }): Promise<void> {
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
      await this.initializeMessageListener('newMessage')

      // Set instance variables
      this.agent = options.agent

      // Register event handlers
      options.agent.events.on(
        MessagePickupEventTypes.LiveSessionRemoved,
        async (data: MessagePickupLiveSessionRemovedEvent) => {
          const connectionId = data.payload.session.connectionId
          this.logger?.info(`*** Session removed for connectionId: ${connectionId} ***`)

          try {
            // Verify message sending method and delete session record from DB
            await this.checkQueueMessages(connectionId)
            await this.removeLiveSessionOnDb(connectionId)
          } catch (handlerError) {
            this.logger?.error(`Error handling LiveSessionRemoved: ${handlerError}`)
          }
        }
      )

      options.agent.events.on(
        MessagePickupEventTypes.LiveSessionSaved,
        async (data: MessagePickupLiveSessionSavedEvent) => {
          const liveSessionData = data.payload.session
          this.logger?.info(`*** Session saved for connectionId: ${liveSessionData.connectionId} ***`)

          try {
            // Add the live session record to the database
            await this.addLiveSessionOnDb(liveSessionData, this.instanceName)
          } catch (handlerError) {
            this.logger?.error(`Error handling LiveSessionSaved: ${handlerError}`)
          }
        }
      )
    } catch (error) {
      this.logger?.error(`[initialize] Initialization failed: ${error}`)
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
  public async takeFromQueue(options: TakeFromQueueOptions): Promise<QueuedMessage[]> {
    const { connectionId, limit, deleteMessages, recipientDid } = options
    this.logger?.info(`[takeFromQueue] Initializing method for ConnectionId: ${connectionId}, Limit: ${limit}`)

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
          this.logger?.debug(`[takeFromQueue] No messages found for ConnectionId: ${connectionId}`)
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
      SET state = 'sending'
      WHERE id IN (
        SELECT id 
        FROM queued_message 
        WHERE (connection_id = $1 OR $2 = ANY (recipient_dids)) 
        AND state = 'pending' 
        ORDER BY created_at 
        LIMIT $3
      )
      RETURNING id, encrypted_message, state, created_at;
    `
      const params = [connectionId, recipientDid, limit ?? 0]
      const result = await this.messagesCollection?.query(query, params)

      if (!result || result.rows.length === 0) {
        this.logger?.debug(`[takeFromQueue] No messages updated for ConnectionId: ${connectionId}`)
        return []
      }

      this.logger?.debug(`[takeFromQueue] ${result.rows.length} messages updated to "sending" state.`)

      // Return the messages as QueuedMessage objects
      return result.rows.map((message) => ({
        id: message.id,
        encryptedMessage: message.encrypted_message,
        receivedAt: new Date(message.created_at),
        state: 'sending',
      }))
    } catch (error) {
      this.logger?.error(`[takeFromQueue] Error: ${error}`)
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
  public async getAvailableMessageCount(options: GetAvailableMessageCountOptions): Promise<number> {
    const { connectionId } = options
    this.logger?.debug(`[getAvailableMessageCount] Initializing method for ConnectionId: ${connectionId}`)

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
        this.logger?.debug(`[getAvailableMessageCount] No pending messages found for ConnectionId: ${connectionId}`)
        return 0
      }

      // Parse the count result
      const numberMessage = Number.parseInt(result.rows[0].count, 10)
      this.logger?.debug(`[getAvailableMessageCount] Count of available messages: ${numberMessage}`)

      return numberMessage
    } catch (error) {
      this.logger?.error(`[getAvailableMessageCount] Error while retrieving message count: ${error}`)
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
  public async addMessage(options: AddMessageOptions): Promise<string> {
    const { connectionId, recipientDids, payload } = options
    this.logger?.debug(`[addMessage] Initializing new message for connectionId: ${connectionId}`)
    const receivedAt = new Date()
    if (!this.agent) {
      throw new Error('Agent is not defined')
    }

    if (!this.messagesCollection) {
      throw new Error('messagesCollection is not defined')
    }

    try {
      // Retrieve local live session details
      const localLiveSession = await this.findLocalLiveSession(connectionId)

      // Insert message into database
      const query = `
        INSERT INTO queued_message(connection_id, recipient_dids, encrypted_message, state, created_at) 
        VALUES($1, $2, $3, $4, $5) 
        RETURNING id
      `

      const state = localLiveSession ? 'sending' : 'pending'

      const result = await this.messagesCollection.query(query, [
        connectionId,
        recipientDids,
        payload,
        state,
        receivedAt,
      ])

      const messageRecord = result?.rows[0]

      this.logger?.debug(
        `[addMessage] Message added with ID: ${messageRecord.id}, receivedAt: ${receivedAt.toISOString()} for connectionId: ${connectionId}`
      )
      // Verify if a live session exists in DB (other instances)
      const liveSessionInPostgres = await this.findLiveSessionInDb(connectionId)

      // Always emit MessageQueued event with complete payload
      await this.emitMessageQueuedEvent({
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
        this.logger?.debug(`[addMessage] Local live session exists for connectionId: ${connectionId}`)

        await this.agent.messagePickup.deliverMessages({
          pickupSessionId: localLiveSession.id,
          messages: [{ id: messageRecord.id, encryptedMessage: payload, receivedAt }],
        })
      } else if (liveSessionInPostgres) {
        this.logger?.debug(
          `[addMessage] Publishing new message event to Pub/Sub channel for connectionId: ${connectionId}`
        )

        await this.pubSubInstance.publish('newMessage', connectionId)
      }

      return messageRecord.id
    } catch (error) {
      this.logger?.error(`[addMessage] Error during message insertion or processing: ${error}`)
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
  public async removeMessages(options: RemoveMessagesOptions): Promise<void> {
    const { connectionId, messageIds } = options
    this.logger?.debug(
      `[removeMessages] Attempting to remove messages with IDs: ${messageIds} for ConnectionId: ${connectionId}`
    )

    // Validate messageIds
    if (!messageIds || messageIds.length === 0) {
      this.logger?.debug('[removeMessages] No message IDs provided. No messages will be removed.')
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

      this.logger?.debug(
        `[removeMessages] Successfully removed messages with IDs: ${messageIds} for ConnectionId: ${connectionId}`
      )
    } catch (error) {
      this.logger?.error(`[removeMessages] Error occurred while removing messages: ${error}`)
      throw new Error(`Failed to remove messages: ${error}`)
    }
  }

  public async shutdown() {
    this.logger?.info('[shutdown] Close connection to postgres')
    await this.messagesCollection?.end()
  }

  /**
   * Subscribes to a specific Pub/Sub channel and handles incoming messages.
   *
   * @param {string} channel - The name of the channel to subscribe to.
   * @returns {Promise<void>} A promise resolving when the listener is initialized.
   */
  private async initializeMessageListener(channel: string): Promise<void> {
    this.logger?.info(`[initializeMessageListener] Initializing method for channel: ${channel}`)

    try {
      // Add a listener to the specified Pub/Sub channel
      await this.pubSubInstance.addChannel(channel, async (connectionId: string) => {
        this.logger?.debug(
          `[initializeMessageListener] Received new message on channel: ${channel} for connectionId: ${connectionId}`
        )

        // Fetch the local live session for the given connectionId
        const pickupLiveSession = await this.findLocalLiveSession(connectionId)

        if (pickupLiveSession) {
          this.logger?.debug(
            `[initializeMessageListener] ${this.instanceName} found a LiveSession on channel: ${channel} for connectionId: ${connectionId}. Delivering messages.`
          )

          // Deliver messages from the queue for the live session
          await this.agent?.messagePickup.deliverMessagesFromQueue({
            pickupSessionId: pickupLiveSession.id,
          })
        } else {
          this.logger?.debug(
            `[initializeMessageListener] No LiveSession found on channel: ${channel} for connectionId: ${connectionId}.`
          )
        }
      })

      this.logger?.info(`[initializeMessageListener] Listener successfully added for channel: ${channel}`)
    } catch (error) {
      this.logger?.error(`[initializeMessageListener] Error initializing listener for channel ${channel}: ${error}`)
      throw new Error(`Failed to initialize listener for channel ${channel}: ${error}`)
    }
  }

  /**
   * This function checks that messages from the connectionId, which were left in the 'sending'
   * state after a liveSessionRemove event, are updated to the 'pending' state for subsequent sending
   * @param connectionID
   */

  private async checkQueueMessages(connectionID: string): Promise<void> {
    try {
      this.logger?.debug(`[checkQueueMessages] Init verify messages state 'sending'`)
      const messagesToSend = await this.messagesCollection?.query(
        'SELECT * FROM queued_message WHERE state = $1 and connection_id = $2',
        ['sending', connectionID]
      )
      if (messagesToSend && messagesToSend.rows.length > 0) {
        for (const message of messagesToSend.rows) {
          // Update the message state to 'pending'
          await this.messagesCollection?.query('UPDATE queued_message SET state = $1 WHERE id = $2', [
            'pending',
            message.id,
          ])
        }

        this.logger?.debug(`[checkQueueMessages] ${messagesToSend.rows.length} messages updated to 'pending'.`)
      } else {
        this.logger?.debug('[checkQueueMessages] No messages in "sending" state.')
      }
    } catch (error) {
      this.logger?.error(`[checkQueueMessages] Error processing messages: ${error}`)
    }
  }

  /**
   * Get current active live mode message pickup session for a given connection
   * @param connectionId
   * @returns
   */
  private async findLocalLiveSession(connectionId: string): Promise<ExtendedMessagePickupSession | undefined> {
    this.logger?.debug(`[findLocalLiveSession] Verify current active live mode for connectionId ${connectionId}`)

    try {
      if (!this.agent) throw new Error('Agent is not defined')
      const localSession = await this.agent.messagePickup.getLiveModeSession({ connectionId })

      return localSession ? { ...localSession, isLocalSession: true } : undefined
    } catch (error) {
      this.logger?.error(`[findLocalLiveSession] error in getLocalliveSession: ${error}`)
    }
  }

  /**
   * This method allow find record into DB to determine if the connectionID has a liveSession in another instance
   * @param connectionId
   * @returns liveSession object or false
   */
  private async findLiveSessionInDb(connectionId: string): Promise<ExtendedMessagePickupSession | undefined> {
    this.logger?.debug(`[findLiveSessionInDb] initializing find registry for connectionId ${connectionId}`)
    if (!connectionId) throw new Error('connectionId is not defined')
    try {
      const queryLiveSession = await this.messagesCollection?.query(
        'SELECT session_id, connection_id, protocol_version FROM live_session WHERE connection_id = $1 LIMIT $2',
        [connectionId, 1]
      )
      // Check if liveSession is not empty (record found)
      const recordFound = queryLiveSession?.rows && queryLiveSession.rows.length > 0
      this.logger?.debug(`[findLiveSessionInDb] record found status ${recordFound} to connectionId ${connectionId}`)
      return recordFound
        ? { ...queryLiveSession.rows[0], role: MessagePickupSessionRole.MessageHolder, isLocalSession: false }
        : undefined
    } catch (error) {
      this.logger?.debug(`[findLiveSessionInDb] Error find to connectionId ${connectionId}`)
      return undefined // Return false in case of an error
    }
  }

  /**
   * This method adds a new connectionId and instance name to DB upon LiveSessionSave event
   * @param connectionId
   * @param instance
   */
  private async addLiveSessionOnDb(session: MessagePickupSession, instance: string): Promise<void> {
    const { id, connectionId, protocolVersion } = session
    this.logger?.debug(`[addLiveSessionOnDb] initializing add LiveSession DB to connectionId ${connectionId}`)
    if (!session) throw new Error('session is not defined')
    try {
      const insertMessageDB = await this.messagesCollection?.query(
        'INSERT INTO live_session (session_id, connection_id, protocol_version, instance) VALUES($1, $2, $3, $4) RETURNING session_id',
        [id, connectionId, protocolVersion, instance]
      )
      const liveSessionId: MessagePickupSession['id'] = insertMessageDB?.rows[0].session_id
      this.logger?.debug(
        `[addLiveSessionOnDb] add liveSession to liveSessionId ${liveSessionId} to connectionId ${connectionId}`
      )
    } catch (error) {
      this.logger?.debug(`[addLiveSessionOnDb] error add liveSession DB ${connectionId}`)
    }
  }

  /**
   *This method remove connectionId record to DB upon LiveSessionRemove event
   * @param connectionId
   */
  private async removeLiveSessionOnDb(connectionId: string): Promise<void> {
    this.logger?.debug(`[removeLiveSessionOnDb] initializing remove LiveSession to connectionId ${connectionId}`)
    if (!connectionId) throw new Error('connectionId is not defined')
    try {
      // Construct the SQL query with the placeholders
      const query = 'DELETE FROM live_session WHERE connection_id = $1'

      // Add connectionId  for query parameters
      const queryParams = [connectionId]

      await this.messagesCollection?.query(query, queryParams)

      this.logger?.debug(`[removeLiveSessionOnDb] removed LiveSession to connectionId ${connectionId}`)
    } catch (error) {
      this.logger?.error(`[removeLiveSessionOnDb] Error removing LiveSession: ${error}`)
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
  private async emitMessageQueuedEvent(options: MessageQueuedEvent) {
    if (!this.agent) {
      this.logger?.error('[emitMessageQueuedEvent] Agent is not initialized.')
      throw new Error('Agent is not initialized.')
    }
    const { message, session } = options

    this.logger?.debug(
      `[emitMessageQueuedEvent] Emitting MessageQueuedEvent for connectionId: ${options.message.connectionId}, messageId: ${options.message.id}`
    )

    this.agent.events.emit(this.agent.context, {
      type: MessageQueuedEventType,
      payload: {
        message,
        session,
      },
    })
  }
}
