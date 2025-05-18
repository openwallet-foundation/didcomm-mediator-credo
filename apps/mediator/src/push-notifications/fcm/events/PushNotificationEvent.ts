import config from '../../../config'
import { Logger } from '../../../logger'
import { getFirebase } from '../firebase'

export const sendFcmPushNotification = async (deviceToken: string, logger: Logger) => {
  if (!config.get('agent:pushNotificationTitle')) {
    throw new Error('Push notification title is missing')
  }
  if (!config.get('agent:pushNotificationBody')) {
    throw new Error('Push notification body is missing')
  }
  try {
    const response = await getFirebase()
      .messaging()
      .send({
        token: deviceToken,
        notification: {
          title: config.get('agent:pushNotificationTitle'),
          body: config.get('agent:pushNotificationBody'),
        },
      })

    return response
  } catch (error) {
    logger.error('Error sending notification', {
      cause: error,
    })
  }
}
