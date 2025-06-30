import type {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  QueueTransportRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/didcomm'

import { AgentContext, utils } from '@credo-ts/core'

import { PushNotificationsFcmRepository } from '../push-notifications/fcm/repository'
import { MessageRecord } from './MessageRecord'
import { MessageRepository } from './MessageRepository'

import { config } from '../config'
import { sendFcmPushNotification } from '../push-notifications/fcm/events/PushNotificationEvent'

export interface NotificationMessage {
  messageType: string
  token?: string
}

export class StorageServiceMessageQueue implements QueueTransportRepository {
  public async getAvailableMessageCount(agentContext: AgentContext, options: GetAvailableMessageCountOptions) {
    const { connectionId } = options

    const messageRepository = agentContext.resolve(MessageRepository)
    const messageRecords = await messageRepository.findByConnectionId(agentContext, connectionId)

    agentContext.config.logger.debug(`Found ${messageRecords.length} messages for connection ${connectionId}`)

    return messageRecords.length
  }

  public async takeFromQueue(agentContext: AgentContext, options: TakeFromQueueOptions): Promise<QueuedMessage[]> {
    const { connectionId, limit, deleteMessages } = options

    const messageRepository = agentContext.resolve(MessageRepository)
    const messageRecords = await messageRepository.findByConnectionId(agentContext, connectionId)

    const messagesToTake = limit ?? messageRecords.length
    agentContext.config.logger.debug(
      `Taking ${messagesToTake} messages from queue for connection ${connectionId} (of total ${
        messageRecords.length
      }) with deleteMessages=${String(deleteMessages)}`
    )

    const messageRecordsToReturn = messageRecords.splice(0, messagesToTake)

    if (deleteMessages) {
      this.removeMessages(agentContext, { connectionId, messageIds: messageRecordsToReturn.map((msg) => msg.id) })
    }

    const queuedMessages = messageRecordsToReturn.map((messageRecord) => ({
      id: messageRecord.id,
      receivedAt: messageRecord.createdAt,
      encryptedMessage: messageRecord.message,
    }))

    return queuedMessages
  }

  public async addMessage(agentContext: AgentContext, options: AddMessageOptions) {
    const { connectionId, payload } = options

    agentContext.config.logger.debug(
      `Adding message to queue for connection ${connectionId} with payload ${JSON.stringify(payload)}`
    )

    const messageRepository = agentContext.resolve(MessageRepository)

    const id = utils.uuid()
    await messageRepository.save(
      agentContext,
      new MessageRecord({
        id,
        connectionId,
        message: payload,
      })
    )

    await this.sendNotification(agentContext, connectionId, 'messageType')

    return id
  }

  public async removeMessages(agentContext: AgentContext, options: RemoveMessagesOptions) {
    const { messageIds } = options

    agentContext.config.logger.debug(`Removing message ids ${messageIds}`)
    const messageRepository = agentContext.resolve(MessageRepository)

    const deletePromises = messageIds.map((messageId) => messageRepository.deleteById(agentContext, messageId))

    await Promise.all(deletePromises)
  }

  private async sendNotification(agentContext: AgentContext, connectionId: string, messageType?: string) {
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
      await this.sendFcmNotification(agentContext, pushNotificationFcmRecord.deviceToken)
    }

    // Check for webhook Url
    if (config.pushNotifications.webhookUrl) {
      // Send a notification to the device
      await this.sendWebhookNotification(
        agentContext,
        config.pushNotifications.webhookUrl,
        connectionId,
        pushNotificationFcmRecord.deviceToken,
        messageType
      )
    }
  }

  private async sendFcmNotification(agentContext: AgentContext, deviceToken: string) {
    try {
      // Found record, send firebase push notification
      agentContext.config.logger.info(`Sending FCM notification to device: ${deviceToken}`)
      await sendFcmPushNotification(agentContext, deviceToken)
      agentContext.config.logger.info(`FCM push notification sent successfully to ${deviceToken}`)
    } catch (error) {
      agentContext.config.logger.error('Error sending FCM notification', {
        cause: error,
      })
    }
  }

  private async sendWebhookNotification(
    agentContext: AgentContext,
    webhookUrl: string,
    connectionId: string,
    deviceToken: string,
    messageType?: string
  ) {
    try {
      // Prepare a message to be sent to the device
      const message: NotificationMessage = {
        messageType: messageType ?? 'default',
        token: deviceToken,
      }

      agentContext.config.logger.info(`Sending notification to ${connectionId}`)
      await this.processNotification(agentContext, webhookUrl, message)
      agentContext.config.logger.info(`Notification sent successfully to ${connectionId}`)
    } catch (error) {
      agentContext.config.logger.error('Error sending notification', {
        cause: error,
      })
    }
  }

  private async processNotification(agentContext: AgentContext, webhookUrl: string, message: NotificationMessage) {
    try {
      const body = {
        fcmToken: message.token,
        messageType: message.messageType,
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
    } catch (error) {
      agentContext.config.logger.error('Error sending notification', {
        cause: error,
      })
    }
  }
}
