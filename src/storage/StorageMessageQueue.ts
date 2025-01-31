import type {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/core'

import { AgentContext, injectable, utils } from '@credo-ts/core'

import { PushNotificationsFcmRepository } from '../push-notifications/fcm/repository'
import { MessageRecord } from './MessageRecord'
import { MessageRepository } from './MessageRepository'

import config from '../config'

export interface NotificationMessage {
  messageType: string
  token: string
}

@injectable()
export class StorageServiceMessageQueue implements MessagePickupRepository {
  private messageRepository: MessageRepository
  private agentContext: AgentContext
  private pushNotificationsFcmRepository: PushNotificationsFcmRepository

  public constructor(
    messageRepository: MessageRepository,
    agentContext: AgentContext,
    pushNotificationsFcmRepository: PushNotificationsFcmRepository
  ) {
    this.messageRepository = messageRepository
    this.agentContext = agentContext
    this.pushNotificationsFcmRepository = pushNotificationsFcmRepository
  }

  public async getAvailableMessageCount(options: GetAvailableMessageCountOptions) {
    const { connectionId } = options

    const messageRecords = await this.messageRepository.findByConnectionId(this.agentContext, connectionId)

    this.agentContext.config.logger.debug(`Found ${messageRecords.length} messages for connection ${connectionId}`)

    return messageRecords.length
  }

  public async takeFromQueue(options: TakeFromQueueOptions): Promise<QueuedMessage[]> {
    const { connectionId, limit, deleteMessages } = options

    const messageRecords = await this.messageRepository.findByConnectionId(this.agentContext, connectionId)

    const messagesToTake = limit ?? messageRecords.length
    this.agentContext.config.logger.debug(
      `Taking ${messagesToTake} messages from queue for connection ${connectionId} (of total ${
        messageRecords.length
      }) with deleteMessages=${String(deleteMessages)}`
    )

    const messageRecordsToReturn = messageRecords.splice(0, messagesToTake)

    if (deleteMessages) {
      this.removeMessages({ connectionId, messageIds: messageRecordsToReturn.map((msg) => msg.id) })
    }

    const queuedMessages = messageRecordsToReturn.map((messageRecord) => ({
      id: messageRecord.id,
      receivedAt: messageRecord.createdAt,
      encryptedMessage: messageRecord.message,
    }))

    return queuedMessages
  }

  public async addMessage(options: AddMessageOptions) {
    const { connectionId, payload } = options

    this.agentContext.config.logger.debug(
      `Adding message to queue for connection ${connectionId} with payload ${JSON.stringify(payload)}`
    )

    const id = utils.uuid()

    await this.messageRepository.save(
      this.agentContext,
      new MessageRecord({
        id,
        connectionId,
        message: payload,
      })
    )

    // Send a notification to the device
    if (config.get('agent:usePushNotifications') && config.get('agent:notificationWebhookUrl')) {
      await this.sendNotification(this.agentContext, connectionId, 'messageType')
    }

    return id
  }

  public async removeMessages(options: RemoveMessagesOptions) {
    const { messageIds } = options

    this.agentContext.config.logger.debug(`Removing message ids ${messageIds}`)

    const deletePromises = messageIds.map((messageId) =>
      this.messageRepository.deleteById(this.agentContext, messageId)
    )

    await Promise.all(deletePromises)
  }

  private async sendNotification(agentContext: AgentContext, connectionId: string, messageType?: string) {
    try {
      // Get the device token for the connection
      const pushNotificationFcmRecord = await this.pushNotificationsFcmRepository.findSingleByQuery(agentContext, {
        connectionId,
      })

      if (!pushNotificationFcmRecord?.deviceToken) {
        this.agentContext.config.logger.info('No device token found for connectionId so skip sending notification')
        return
      }

      // Prepare a message to be sent to the device
      const message: NotificationMessage = {
        messageType: messageType || 'default',
        token: pushNotificationFcmRecord?.deviceToken,
      }

      this.agentContext.config.logger.info(`Sending notification to ${pushNotificationFcmRecord?.connectionId}`)
      await this.processNotification(message)
      this.agentContext.config.logger.info(`Notification sent successfully to ${connectionId}`)
    } catch (error) {
      this.agentContext.config.logger.error('Error sending notification', {
        cause: error,
      })
    }
  }

  private async processNotification(message: NotificationMessage) {
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

      const response = await fetch(config.get('agent:notificationWebhookUrl'), requestOptions)

      if (response.ok) {
        this.agentContext.config.logger.info('Notification sent successfully')
      } else {
        this.agentContext.config.logger.error('Error sending notification', {
          cause: response.statusText,
        })
      }
    } catch (error) {
      this.agentContext.config.logger.error('Error sending notification', {
        cause: error,
      })
    }
  }
}
