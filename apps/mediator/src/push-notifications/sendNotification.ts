import { AgentContext } from '@credo-ts/core'
import { config } from '../config'
import { sendFcmPushNotification } from './fcm/events/PushNotificationEvent'
import { PushNotificationsFcmRepository } from './fcm/repository'

export async function sendNotification(agentContext: AgentContext, connectionId: string) {
  if (!config.pushNotifications) return

  // Get the device token for the connection
  const pushNotificationsFcmRepository = agentContext.resolve(PushNotificationsFcmRepository)
  const pushNotificationFcmRecord = await pushNotificationsFcmRepository.findSingleByQuery(agentContext, {
    connectionId,
  })

  if (!pushNotificationFcmRecord?.deviceToken) {
    agentContext.config.logger.info('No device token found for connectionId so skip sending notification')
    return
  }

  if (config.pushNotifications.firebase) {
    // Check for firebase configuration
    // Send a Firebase Cloud Message notification to the device found for a given connection
    await sendFcmPushNotification(agentContext, pushNotificationFcmRecord.deviceToken)
  }

  // Check for webhook Url
  if (config.pushNotifications.webhookUrl) {
    // Send a notification to the device
    await sendWebhookNotification(
      agentContext,
      config.pushNotifications.webhookUrl,
      connectionId,
      pushNotificationFcmRecord.deviceToken
    )
  }
}

async function sendWebhookNotification(
  agentContext: AgentContext,
  webhookUrl: string,
  connectionId: string,
  deviceToken: string
) {
  try {
    // Prepare a message to be sent to the device
    agentContext.config.logger.info(`Sending notification to ${connectionId}`)
    const body = {
      fcmToken: deviceToken,
    }
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }

    const response = await fetch(webhookUrl, requestOptions)

    if (response.ok) {
      agentContext.config.logger.info('Notification sent successfully')
    } else {
      agentContext.config.logger.error('Error sending notification', {
        cause: response.statusText,
      })
    }

    agentContext.config.logger.info(`Notification sent successfully to ${connectionId}`)
  } catch (error) {
    agentContext.config.logger.error('Error sending notification', {
      cause: error,
    })
  }
}
