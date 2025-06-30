import { AgentContext } from '@credo-ts/core'
import { config } from '../../../config'
import { firebase } from '../firebase'

export const sendFcmPushNotification = async (agentContext: AgentContext, deviceToken: string) => {
  if (!config.pushNotifications.firebase || !firebase) {
    agentContext.config.logger.warn('Firebase is not initialized. Push notifications are disabled.')
    return
  }

  try {
    const response = await firebase.messaging().send({
      token: deviceToken,
      notification: {
        title: config.pushNotifications.firebase.notificationTitle,
        body: config.pushNotifications.firebase.notificationBody,
      },
    })

    return response
  } catch (error) {
    agentContext.config.logger.error('Error sending notification', {
      cause: error,
    })
  }
}
