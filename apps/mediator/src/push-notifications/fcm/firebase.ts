import { Agent } from '@credo-ts/core'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'
import admin from 'firebase-admin'
import config from '../../config'
import { Logger } from '../../logger'
import { PickupType } from '../../pickup/type'
import { sendFcmPushNotification } from './events/PushNotificationEvent'

export const firebase: admin.app.App | undefined = !config.get('agent:usePushNotifications')
  ? undefined
  : admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.get('agent:firebase:projectId'),
          clientEmail: config.get('agent:firebase:clientEmail'),
          privateKey: config.get('agent:firebase:privateKey')?.includes('\\n')
            ? config.get('agent:firebase:privateKey')?.replace(/\\n/g, '\n')
            : config.get('agent:firebase:privateKey')?.trim(),
        }),
      })

// DirectDelivery sender is built into the storage module and does not need initialization here
export async function initializePushNotificationSender(agent: Agent) {
  if (!config.get('agent:usePushNotifications')) return

  // For live mode and postgres pickup type, listen for queued messages and send push notifications
  if (
    config.get('agent:pickup:strategy') === MessageForwardingStrategy.QueueAndLiveModeDelivery &&
    config.get('agent:pickup:type') === PickupType.Postgres.toLowerCase()
  ) {
    const { MessageQueuedEventType } = await import(
      '../../../../../packages/message-pickup-repository-pg/src/interfaces'
    )
    type MessageQueuedEvent = import(
      '../../../../../packages/message-pickup-repository-pg/src/interfaces'
    ).MessageQueuedEvent

    agent.config.logger.info(
      'Initializing push notification sender on queued messages for postgres pickup type and queue and live mode delivery strategy'
    )
    agent.events.on(MessageQueuedEventType, async (data) => {
      const { message } = data.payload as unknown as MessageQueuedEvent
      const pushNotificationRecord = await agent.modules.pushNotificationsFcm.getPushNotificationRecordByConnectionId(
        message.connectionId
      )
      if (pushNotificationRecord?.deviceToken) {
        sendFcmPushNotification(pushNotificationRecord.deviceToken, agent.config.logger as Logger)
      }
    })
  }
}
