import { Agent, AgentContext } from '@credo-ts/core';
import config from '../../../config'
import { Logger } from '../../../logger'
import { firebaseApps } from '../firebase';
import { PushNotificationsFcmRecord, PushNotificationsFcmRepository } from '../repository'

export const sendFcmPushNotification = async (agentContext: AgentContext, repository: PushNotificationsFcmRepository, pushNotificationRecord: PushNotificationsFcmRecord, logger: Logger) => {

  const title = config.get('agent:pushNotificationTitle')
  const body = config.get('agent:pushNotificationBody')

  if (!title || !body) {
    logger.warn('Push notification title or body is missing in configuration')
    return
  }

  if (pushNotificationRecord.deviceToken === null) {
    logger.warn('Device token is null, cannot send push notification')
    return
  }

  // Try to send using the specified projectId first
  let firebase = firebaseApps.get(pushNotificationRecord.projectId || '')
  if (firebase) {
    try {
      logger.debug(`Sending push notification using Firebase projectId: ${pushNotificationRecord.projectId}`)
      const response = await firebase.messaging().send({
        token: pushNotificationRecord.deviceToken,
        notification: {
          title,
          body,
        },
      })
      if (response) {
        logger.info('Push notification sent successfully', { projectId: pushNotificationRecord.projectId, response })
        return response
      }
    } catch (error) {
      logger.debug('Error sending notification', {
        cause: error,
      })
    }
  }

  // If attempt fails or no projectId specified, try all available firebase apps
  for (const [projectId, firebase] of firebaseApps) {
    try {
      logger.debug(`Sending push notification using Firebase projectId: ${projectId}`)
      const response = await firebase.messaging().send({
        token: pushNotificationRecord.deviceToken,
        notification: {
          title,
          body,
        },
      })
      if (response) {
        logger.info('Push notification sent successfully', { projectId, response })
        pushNotificationRecord.projectId = projectId // Update record with working projectId
        await repository.update(agentContext, pushNotificationRecord)
        return response
      }
    } catch (error) {
      logger.debug('Error sending notification', {
        cause: error,
      })
    }
  }
}
