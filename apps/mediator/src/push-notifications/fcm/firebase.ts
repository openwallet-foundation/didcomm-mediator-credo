import { Agent } from '@credo-ts/core'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'
import admin from 'firebase-admin'
import config from '../../config'
import { Logger } from '../../logger'
import { PickupType } from '../../pickup/type'
import { sendFcmPushNotification } from './events/PushNotificationEvent'
import { PushNotificationsFcmRepository } from './repository'

export const firebaseApps: Map<string, admin.app.App> = new Map()

const setupFirebaseSender = async (agent: Agent) => {
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
      if (pushNotificationRecord.deviceToken) {
        const repository = agent.dependencyManager.resolve(PushNotificationsFcmRepository)
        sendFcmPushNotification(agent.context, repository, pushNotificationRecord, agent.config.logger as Logger)
      }
    })
  }
}

export const initializeFirebase = async (agent: Agent) => {
  if (!config.get('agent:usePushNotifications')) {
    return
  }

  const firebaseConfigs = config.get('agent:firebase') as {
    projectId: string
    clientEmail: string
    privateKey: string
  }[]

  if (!Array.isArray(firebaseConfigs) || firebaseConfigs.length === 0) {
    throw new Error('Firebase configuration is missing or invalid.')
  }

  for (const firebaseConfig of firebaseConfigs) {
    if (!firebaseConfig.projectId || !firebaseConfig.clientEmail || !firebaseConfig.privateKey) {
      throw new Error('Firebase configuration is incomplete. Please provide projectId, clientEmail, and privateKey.')
    }

    if (!firebaseApps.has(firebaseConfig.projectId)) {
      const app = admin.initializeApp(
        {
          credential: admin.credential.cert({
            projectId: firebaseConfig.projectId,
            clientEmail: firebaseConfig.clientEmail,
            privateKey: firebaseConfig.privateKey?.includes('\\n')
              ? firebaseConfig.privateKey.replace(/\\n/g, '\n')
              : firebaseConfig.privateKey?.trim(),
          }),
        },
        firebaseConfig.projectId
      ) // Use projectId as the app name
      firebaseApps.set(firebaseConfig.projectId, app)
    }
  }

  await setupFirebaseSender(agent)
}
