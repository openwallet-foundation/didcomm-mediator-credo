import { randomUUID } from 'node:crypto'
import {
  DidCommEventTypes,
  DidCommMessageForwardingStrategy,
  DidCommMessageSentEvent,
  OutboundMessageSendStatus,
} from '@credo-ts/didcomm'
import { DidCommMessagePickupSessionRole } from '@credo-ts/didcomm/build/modules/message-pickup/DidCommMessagePickupSession'
import Redis from 'ioredis'
import type { MediatorAgent } from '../agent'
import { config } from '../config'
import { RedisStreamMessagePublishing } from '../multi-instance/redis-stream-message-publishing/redisStreamMessagePublishing'
import { sendNotification } from '../push-notifications/sendNotification'

/**
 * Initialize redis message publishing for queued mediator messages. This message publishing implementation is not
 * tied to a specific transport queue implementation, and can work with any implementation as long as the transport queue
 * implementation does not handle message sending and push notification itself.
 *
 * Currently the following queue transport implementations are supported:
 * - `DynamoDbMessagePickupRepository` (message pickup type=dynamodb)
 * - `StorageServiceMessageQueue` (message pickup type=credo)
 *
 * Currently the following queue transport implementations are not supported:
 * - `PostgresMessagePickupRepository` (message pickup type=postgres). Due to it handling the
 *   multi-instance message delivery in the transport implementation.
 *
 * This will handle:
 * - publishing and handling of queued message delivery between multi-instance deployments
 * - sending of push notifications for queued messages that could not be delivered
 * - automatic failover of messages sent to another server that have never been claimed and acknowledged.
 *    This means that after a minute a push notification will be sent if an error occurred.
 */
export async function loadRedisMessageDelivery({
  abortSignal,
  agent,
}: { abortSignal?: AbortSignal; agent: MediatorAgent }) {
  if (config.cache.type !== 'redis' || config.messagePickup.multiInstanceDelivery.type !== 'redis') return

  // TODO: we should reuse the client from the cache implementation. Requires change in Credo redis-cache package
  const client = new Redis(config.cache.redisUrl)

  // We generate a random server instance, it does not really matter as long as it's unique between active servers
  // if a server crashes we lose the active socket connections.
  const streamPublishing = new RedisStreamMessagePublishing(agent, client, randomUUID())

  agent.events.on<DidCommMessageSentEvent>(DidCommEventTypes.DidCommMessageSent, async (event) => {
    // We're only interested in queued messages
    if (event.payload.status !== OutboundMessageSendStatus.QueuedForPickup) return

    // We can't do anything if we don't know the connection to send the message to
    if (!event.payload.message.connection) return

    const connectionId = event.payload.message.connection.id

    // If QueueOnly we haven't tried the local session yet.
    // TODO: do we want to handle when we don't want to send to local sessions?
    if (config.messagePickup.forwardingStrategy === DidCommMessageForwardingStrategy.QueueOnly) {
      agent.config.logger.debug(
        'Trying to send queued message to session directly, since forwarding strategy is set to QueueOnly',
        { connectionId }
      )
      try {
        const session = await agent.modules.messagePickup.getLiveModeSession({
          connectionId,
          role: DidCommMessagePickupSessionRole.MessageHolder,
        })

        if (session) {
          agent.config.logger.debug(
            'Found a local session to send queued message to session directly. Delivering messages from queue',
            { connectionId }
          )
          await agent.modules.messagePickup.deliverMessagesFromQueue({
            pickupSessionId: session.id,
          })

          agent.config.logger.debug(
            'Found a local session to send queued message to session directly. Delivering messages from queue',
            { connectionId }
          )

          // We succeeded in delivering the message. We can return
          return
        }

        // We didn't send the message yet, we need to check other instances
      } catch (error) {
        agent.config.logger.debug(
          // In case of an error we didn't send the message yet, we need to check other instances
          'An error occurred while retrieving or sending queued messages to a local session. Continuing with other servers or falling back to sending a push notifications.',
          { connectionId }
        )
      }
    }

    // Try finding another server to send the message to
    const serverId = await streamPublishing.getConnectionServer(connectionId)

    if (serverId) {
      // Special case. Usually this won't happen because then the above code would already have
      // handled it. So it means the session was closed, but not removed from reddit. We remove it
      // and will send a push notification
      if (serverId === streamPublishing.serverId) {
        agent.config.logger.debug(
          `Found own server '${serverId}' in redis for connection '${connectionId}'. Unregistering connection from redis, since we already tried sending to local session.`
        )

        await streamPublishing.unregisterConnection(connectionId).catch(() => {})
      } else {
        try {
          agent.config.logger.debug(
            `Found server '${serverId}' in redis for connection '${connectionId}'. Sending message to server over redis stream.`
          )
          await streamPublishing.sendMessageToServer(serverId, {
            connectionId,
          })
          return
        } catch {
          // If it fails, we will just send a push notification
          agent.config.logger.debug(
            `Error sending message to server '${serverId}' for connection '${connectionId}'. Falling back to push notification sending`
          )
        }
      }
    }

    await sendNotification(agent.context, connectionId)
  })

  // We want to send a push notification for all messages that were emitted on the stream but not handled
  // it probably means the socket was closed and thus not correctly handled.
  void streamPublishing.claimPendingMessages(
    async (serverId, message) => {
      agent.config.logger.debug(
        `Server '${streamPublishing.serverId}' claimed pending message ${message.id} from server ${serverId}. Trying to send push notification.`
      )

      await sendNotification(agent.context, message.payload.connectionId)
    },
    { signal: abortSignal }
  )

  // First we want to try to send the message to an open socket connection. If that's not possible, we will emit a push notification.
  void streamPublishing.listenForMessages(
    async (message) => {
      agent.config.logger.debug(
        `Server '${streamPublishing.serverId}' received message ${message.id} for connection '${message.payload.connectionId}'. Attempting to deliver to local session.`
      )

      const pickupSession = await agent.modules.messagePickup.getLiveModeSession({
        connectionId: message.payload.connectionId,
        role: DidCommMessagePickupSessionRole.MessageHolder,
      })

      if (pickupSession) {
        try {
          agent.config.logger.debug(
            `Found local session for connection '${message.payload.connectionId}'. Delivering messages from queue.`
          )

          await agent.modules.messagePickup.deliverMessagesFromQueue({
            pickupSessionId: pickupSession.id,
          })

          agent.config.logger.debug(
            `Successfully delivered messages to local session for connection '${message.payload.connectionId}' for message ${message.id}`
          )

          // We delivered the messages, we don't have to send a push notification
          // Improvement: If we haven't received an ack in X seconds, we should still
          // send the push notification
          return
        } catch (error) {
          // In case an error occurred with the delivery of the message, we will send a push notification
          agent.config.logger.debug(
            `Error delivering message ${message.id} to local session for connection '${message.payload.connectionId}'. Falling back to push notification.`,
            { error }
          )
        }
      } else {
        agent.config.logger.debug(
          `No local session found for connection '${message.payload.connectionId}'. Falling back to push notification.`
        )
      }

      await sendNotification(agent.context, message.payload.connectionId)
    },
    { signal: abortSignal }
  )
}
