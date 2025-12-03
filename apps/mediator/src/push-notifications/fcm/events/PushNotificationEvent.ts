import { AgentContext } from '@credo-ts/core'
import config from '../../../config'
import { Logger } from '../../../logger'
import { firebaseApps } from '../firebase'
import { PushNotificationsFcmRecord, PushNotificationsFcmRepository } from '../repository'
import { FirebaseError } from 'firebase-admin';

const filterAppsByProjectId = (projectId: string | undefined) => {
  if (!projectId) {
    return firebaseApps
  }

  const app = firebaseApps.get(projectId)
  if (app) {
    return new Map([[projectId, app]])
  }
}

const isFirebaseLikeError = (error: unknown) =>
  error &&
  typeof error === 'object' &&
  error !== null &&
  typeof (error as any).code === 'string' &&
  /(app|auth|messaging|storage|firestore|database)\//.test((error as any).code);


export const sendFcmPushNotification = async (
  agentContext: AgentContext,
  repository: PushNotificationsFcmRepository,
  pushNotificationRecord: PushNotificationsFcmRecord,
  logger: Logger
) => {
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
  const filteredFirebaseApps = filterAppsByProjectId(pushNotificationRecord.firebaseProjectId)
  if (!filteredFirebaseApps) {
    logger.warn(`No Firebase app found for projectId: ${pushNotificationRecord.firebaseProjectId}`)
    return
  }

  // If attempt fails or no projectId specified, try all available firebase apps
  for (const [projectId, firebase] of filteredFirebaseApps) {
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
        pushNotificationRecord.firebaseProjectId = projectId // Update record with working projectId
        await repository.update(agentContext, pushNotificationRecord)
        return response
      }
    } catch (error) {
      if (isFirebaseLikeError(error)) {
        logger.debug('Error sending notification', { cause: error });
      } else {
        logger.error('Unexpected error sending push notification', { cause: error });
      }
    }
  }
}
