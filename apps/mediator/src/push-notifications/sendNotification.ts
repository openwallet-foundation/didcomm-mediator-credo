import { AgentContext } from '@credo-ts/core'
import { config } from '../config.js'
import { sendFcmPushNotification } from './fcm/events/PushNotificationEvent.js'
import { PushNotificationsFcmRepository } from './fcm/repository/index.js'

export async function sendNotification(agentContext: AgentContext, connectionId: string) {
  if (!config.pushNotifications) return

  // Get the device token for the connection
  const pushNotificationsFcmRepository = agentContext.resolve(PushNotificationsFcmRepository)
  const pushNotificationFcmRecord = await pushNotificationsFcmRepository.findSingleByQuery(agentContext, {
    connectionId,
  })

  // Check for webhook Url
  if (config.pushNotifications.webhookUrl) {
    // Emit a webhook notification, which can send a notification based on the
    // connectionId or optionally the device token.
    await sendWebhookNotification(
      agentContext,
      config.pushNotifications.webhookUrl,
      connectionId,
      pushNotificationFcmRecord?.deviceToken
    )
  }

  if (config.pushNotifications.firebase) {
    if (!pushNotificationFcmRecord) {
      agentContext.config.logger.debug(
        `No device token found for connection ${connectionId} so skip sending pushing notification`
      )
      return
    }

    // Check for firebase configuration
    // Send a Firebase Cloud Message notification to the device found for a given connection
    await sendFcmPushNotification(agentContext, pushNotificationFcmRecord)
  }
}

async function sendWebhookNotification(
  agentContext: AgentContext,
  webhookUrl: string,
  connectionId: string,
  deviceToken?: string | null
) {
  try {
    // Prepare a message to be sent to the device
    agentContext.config.logger.info(`Sending notification to ${connectionId}`)
    const body = {
      connectionId,
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
