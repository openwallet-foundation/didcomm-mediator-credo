import { DidCommMessageForwardingStrategy } from '@credo-ts/didcomm'
import { PostgresMessageQueuedEvent, PostgresMessageQueuedEventType } from '@credo-ts/didcomm-transport-queue-postgres'
import { MediatorAgent } from '../agent.js'
import { config } from '../config.js'
import { DidcommMessageQueuedEvent, MediatorEventTypes } from '../events.js'
import { sendNotification } from '../push-notifications/sendNotification.js'

// DirectDelivery sender is built into the storage module and does not need initialization here
export async function loadPushNotificationSender(agent: MediatorAgent) {
  if (!config.pushNotifications.firebase) return

  // If we have multi instance delivery that should handle the push notification delivery (since we can't locally handle it)
  if (config.messagePickup.multiInstanceDelivery.type !== 'none') return

  if (
    config.messagePickup.forwardingStrategy !== DidCommMessageForwardingStrategy.DirectDelivery &&
    config.messagePickup.storage.type === 'postgres'
  ) {
    // We only want to listen for queued messages and send push notifications for live mode and postgres pickup type
    agent.config.logger.info(
      'Initializing push notification sender on queued messages for postgres pickup type and queue and live mode delivery strategy'
    )

    // TODO: we should only send a push notification when a message couldn't be delivered directly
    // Currently it will send a push notification for every message added to the queue
    agent.events.on<PostgresMessageQueuedEvent>(PostgresMessageQueuedEventType, async (event) => {
      const connectionId = event.payload.message.connectionId
      await sendNotification(agent.context, connectionId)
    })
  }

  if (
    config.messagePickup.forwardingStrategy !== DidCommMessageForwardingStrategy.DirectDelivery &&
    config.messagePickup.storage.type !== 'postgres'
  ) {
    // We only want to listen for queued messages and send push notifications for live mode and postgres pickup type
    agent.config.logger.info(
      `Initializing push notification sender on queued messages for ${config.messagePickup.storage.type} pickup type and queue and live mode delivery strategy`
    )

    agent.events.on<DidcommMessageQueuedEvent>(MediatorEventTypes.DidCommMessageQueued, async (event) => {
      await sendNotification(agent.context, event.payload.connectionId)
    })
  }
}
