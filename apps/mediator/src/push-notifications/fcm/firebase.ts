import { Agent } from '@credo-ts/core'
import { MessageForwardingStrategy } from '@credo-ts/didcomm'
import {
  PostgresMessagePickupMessageQueuedEvent,
  PostgresMessagePickupMessageQueuedEventType,
} from '@credo-ts/didcomm-message-pickup-postgres'
import admin from 'firebase-admin'
import { config } from '../../config'
import { sendFcmPushNotification } from './events/PushNotificationEvent'

export const firebase: admin.app.App | undefined = !config.pushNotifications?.firebase
  ? undefined
  : admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.pushNotifications.firebase.projectId,
          clientEmail: config.pushNotifications.firebase.clientEmail,
          privateKey: config.pushNotifications.firebase.privateKey,
        }),
      })

// DirectDelivery sender is built into the storage module and does not need initialization here
export async function initializePushNotificationSender(agent: Agent) {
  if (!config.pushNotifications.firebase) return

  // For live mode and postgres pickup type, listen for queued messages and send push notifications
  if (
    config.messagePickup.forwardingStrategy === MessageForwardingStrategy.QueueAndLiveModeDelivery &&
    config.messagePickup.storage.type === 'postgres'
  ) {
    agent.config.logger.info(
      'Initializing push notification sender on queued messages for postgres pickup type and queue and live mode delivery strategy'
    )
    agent.events.on<PostgresMessagePickupMessageQueuedEvent>(
      PostgresMessagePickupMessageQueuedEventType,
      async (data) => {
        const { message } = data.payload
        const pushNotificationRecord = await agent.modules.pushNotificationsFcm.getPushNotificationRecordByConnectionId(
          message.connectionId
        )
        if (pushNotificationRecord.deviceToken) {
          sendFcmPushNotification(agent.context, pushNotificationRecord.deviceToken)
        }
      }
    )
  }
}
