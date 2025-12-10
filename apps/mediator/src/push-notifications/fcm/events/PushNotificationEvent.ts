import { AgentContext } from '@credo-ts/core'
import { config } from '../../../config.js'
import { filterAppsByProjectId, firebaseApps, isFirebaseLikeError } from '../firebase.js'
import { PushNotificationsFcmRecord } from '../repository/PushNotificationsFcmRecord.js'
import { PushNotificationsFcmRepository } from '../repository/PushNotificationsFcmRepository.js'

export const sendFcmPushNotification = async (
  agentContext: AgentContext,
  pushNotificationFcmRecord: PushNotificationsFcmRecord
) => {
  if (!pushNotificationFcmRecord.deviceToken) {
    agentContext.config.logger.warn(
      `No device token found for connection ${pushNotificationFcmRecord.connectionId} so skip sending pushing notification`
    )
    return
  }

  if (!config.pushNotifications.firebase || !firebaseApps || firebaseApps.size === 0) {
    agentContext.config.logger.warn('Firebase is not initialized. Push notifications are disabled.')
    return
  }

  // Try to send using the specified projectId first
  const filteredFirebaseApps = filterAppsByProjectId(pushNotificationFcmRecord.firebaseProjectId)
  if (!filteredFirebaseApps) {
    agentContext.config.logger.warn(
      `No Firebase app found for projectId: ${pushNotificationFcmRecord.firebaseProjectId}`
    )
    return
  }

  // If attempt fails or no projectId specified, try all available firebase apps
  for (const [projectId, firebase] of filteredFirebaseApps) {
    try {
      agentContext.config.logger.debug(`Sending push notification using Firebase projectId: ${projectId}`)
      const response = await firebase.messaging().send({
        token: pushNotificationFcmRecord.deviceToken,
        notification: {
          title: config.pushNotifications.firebase.notificationTitle,
          body: config.pushNotifications.firebase.notificationBody,
        },
      })
      if (response) {
        agentContext.config.logger.info('Push notification sent successfully', { projectId, response })

        // Update record with working projectId
        if (!pushNotificationFcmRecord.firebaseProjectId) {
          const pushNotificationsFcmRepository = agentContext.resolve(PushNotificationsFcmRepository)

          pushNotificationFcmRecord.firebaseProjectId = projectId
          await pushNotificationsFcmRepository.update(agentContext, pushNotificationFcmRecord)
        }
        return response
      }
    } catch (error) {
      if (isFirebaseLikeError(error)) {
        agentContext.config.logger.debug('Error sending notification', { cause: error })
      } else {
        agentContext.config.logger.error('Unexpected error sending push notification', { cause: error })
      }
    }
  }
}
