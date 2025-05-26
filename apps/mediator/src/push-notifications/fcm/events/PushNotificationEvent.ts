import config from '../../../config'
import { Logger } from '../../../logger'
import { firebase } from '../firebase'

export const sendFcmPushNotification = async (deviceToken: string, logger: Logger) => {
  if (firebase === undefined) {
    logger.warn('Firebase is not initialized. Push notifications are disabled.')
    return
  }

  const title = config.get('agent:pushNotificationTitle')
  const body = config.get('agent:pushNotificationBody')

  if (!title || !body) {
    throw new Error('Push notification title or body is missing')
  }

  try {
    const response = await firebase.messaging().send({
      token: deviceToken,
      notification: {
        title,
        body,
      },
    })

    return response
  } catch (error) {
    logger.error('Error sending notification', {
      cause: error,
    })
  }
}
