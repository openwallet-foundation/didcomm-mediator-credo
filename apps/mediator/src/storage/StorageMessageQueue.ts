import { AgentContext, EventEmitter, utils } from '@credo-ts/core'
import type {
  AddMessageOptions,
  DidCommQueueTransportRepository,
  GetAvailableMessageCountOptions,
  QueuedDidCommMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/didcomm'
import { DidcommMessageQueuedEvent, MediatorEventTypes } from '../events.js'
import { MessageRecord } from './MessageRecord.js'
import { MessageRepository } from './MessageRepository.js'

export class StorageServiceMessageQueue implements DidCommQueueTransportRepository {
  public async getAvailableMessageCount(agentContext: AgentContext, options: GetAvailableMessageCountOptions) {
    const { connectionId } = options

    const messageRepository = agentContext.resolve(MessageRepository)
    const messageRecords = await messageRepository.findByConnectionId(agentContext, connectionId)

    agentContext.config.logger.debug(`Found ${messageRecords.length} messages for connection ${connectionId}`)

    return messageRecords.length
  }

  public async takeFromQueue(
    agentContext: AgentContext,
    options: TakeFromQueueOptions
  ): Promise<QueuedDidCommMessage[]> {
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

    this.emitMessageQueuedEvent(agentContext, connectionId)

    return id
  }

  public async removeMessages(agentContext: AgentContext, options: RemoveMessagesOptions) {
    const { messageIds } = options

    agentContext.config.logger.debug(`Removing message ids ${messageIds}`)
    const messageRepository = agentContext.resolve(MessageRepository)

    const deletePromises = messageIds.map((messageId) => messageRepository.deleteById(agentContext, messageId))

    await Promise.all(deletePromises)
  }

  private emitMessageQueuedEvent(agentContext: AgentContext, connectionId: string) {
    const eventEmitter = agentContext.resolve(EventEmitter)
    eventEmitter.emit<DidcommMessageQueuedEvent>(agentContext, {
      type: MediatorEventTypes.DidCommMessageQueued,
      payload: {
        connectionId,
      },
    })
  }
}
