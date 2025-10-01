import Redis from 'ioredis'
import { config } from '../config'
import { RedisStreamMessagePublishing } from '../multi-instance/redis-stream-message-publishing/redisStreamMessagePublishing'
import { randomUUID } from 'node:crypto'
import { AgentContext, EventEmitter } from '@credo-ts/core'
import { sendFcmPushNotification } from '../push-notifications/fcm/events/PushNotificationEvent'
import { PushNotificationsFcmApi } from '../push-notifications/fcm'
import { DidCommMessageForwardingStrategy, DidCommMessagePickupApi } from '@credo-ts/didcomm'
import { DidCommMessagePickupSessionRole } from '@credo-ts/didcomm/build/modules/message-pickup/DidCommMessagePickupSession'

export async function loadRedisMessagePublishing({
  abortSignal,
  agentContext,
}: { abortSignal?: AbortSignal; agentContext: AgentContext }) {
  if (config.cache.type !== 'redis') {
    throw new Error('Cache type must be redis to use redis message publishing')
  }

  // TODO: we should reuse the client from the cache implementation. Requires change in Credo redis-cache package
  const client = new Redis(config.cache.redisUrl)

  // We generate a random server instance, it does not really matter as long as it's unique between active servers
  // if a server crashes we lose the active socket connections.
  const streamPublishing = new RedisStreamMessagePublishing(client, randomUUID())
  const pushNotificationsFcmApi = agentContext.resolve(PushNotificationsFcmApi)
  const messagePickupApi = agentContext.resolve(DidCommMessagePickupApi)

  const eventEmitter = agentContext.resolve(EventEmitter)
  eventEmitter.on('', async (event) => {
    // If QueueOnly we haven't tried the local session yet
    if (config.messagePickup.forwardingStrategy === DidCommMessageForwardingStrategy.QueueOnly) {
      try {
        const session = await messagePickupApi.getLiveModeSession({
          connectionId: event.payload.connectionId,
          role: DidCommMessagePickupSessionRole.MessageHolder,
        })

        if (session) {
          await messagePickupApi.deliverMessagesFromQueue({
            pickupSessionId: session.id,
          })

          // We succeeded in delivering the message. We can return
          return
        }

        // We didn't send the message yet, we need to check other instances
      } catch (error) {
        // In case of an error we didn't send the message yet, we need to check other instances
      }
    }

    // Try finding another server to send the message to
    const serverId = await streamPublishing.getConnectionServer(event.payload.connectionId)

    if (serverId) {
      // Special case. Usually this won't happen because then the above could would already have
      // handled it. So it means the session was closed, but not removed from reddit. We remove it
      // and will send a push notification
      if (serverId === streamPublishing.serverId) {
        await streamPublishing.unregisterConnection(event.payload.connectionId).catch(() => {})
      } else {
        try {
          await streamPublishing.sendMessageToServer(serverId, {
            connectionId: event.payload.connectionId,
          })
          return
        } catch {
          // If it fails, we will just send a push notification
        }
      }
    }

    // If there's no server, we send a push notification
    const pushNotificationRecord = await pushNotificationsFcmApi.getPushNotificationRecordByConnectionId(
      event.payload.connectionId
    )

    if (pushNotificationRecord.deviceToken) {
      await sendFcmPushNotification(agentContext, pushNotificationRecord.deviceToken)
    }
  })

  // We want to send a push notification for all messages that were emitted on the stream but not handled
  // it probably means the socket was closed and thus not correctly handled.
  void streamPublishing.claimPendingMessages(
    async (message) => {
      const pushNotificationRecord = await pushNotificationsFcmApi.getPushNotificationRecordByConnectionId(
        message.payload.connectionId
      )

      if (pushNotificationRecord.deviceToken) {
        await sendFcmPushNotification(agentContext, pushNotificationRecord.deviceToken)
      }
    },
    { signal: abortSignal }
  )

  // First we want to try to send the message to an open socket connection. If that's not possible, we will emit a push notification.
  void streamPublishing.listenForMessages(
    async (message) => {
      const pickupSession = await messagePickupApi.getLiveModeSession({
        connectionId: message.id,
        role: DidCommMessagePickupSessionRole.MessageHolder,
      })

      if (pickupSession) {
        try {
          await messagePickupApi.deliverMessagesFromQueue({
            pickupSessionId: pickupSession.id,
          })

          // We delivered the messages, we don't have to send a push notification
          // Improvement: If we haven't received an ack in X seconds, we should still
          // send the push notification
          return
        } catch (error) {
          // In case an error occurred with the delivery of hte message, we will send a push notification
        }
      }

      // If we weren't able to deliver the message, we will send a push notification
      const pushNotificationRecord = await pushNotificationsFcmApi.getPushNotificationRecordByConnectionId(
        message.payload.connectionId
      )

      if (pushNotificationRecord.deviceToken) {
        await sendFcmPushNotification(agentContext, pushNotificationRecord.deviceToken)
      }
    },
    { signal: abortSignal }
  )
}
