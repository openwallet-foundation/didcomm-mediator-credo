import { AgentContext, EventEmitter, RecordNotFoundError, utils } from '@credo-ts/core'
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
  /**
   * A Pickup V2 delivery keeps messages in the queue until the recipient sends
   * `messages-received`. A live session can receive several forwards before the
   * first acknowledgement returns, so without a lease every forward reads and
   * delivers the same records again.
   *
   * Leases are local to this single-instance storage backend. They expire so a
   * message remains recoverable if a recipient disconnects before acknowledging
   * delivery.
   */
  private readonly deliveryLeases = new Map<string, number>()
  private readonly deliveryLeaseDurationMs = 30_000

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

    const now = Date.now()
    this.clearExpiredDeliveryLeases(now)

    const messageRecordsToReturn = messageRecords
      .filter((messageRecord) => !this.deliveryLeases.has(messageRecord.id))
      .slice(0, messagesToTake)

    if (deleteMessages) {
      await this.removeMessages(agentContext, {
        connectionId,
        messageIds: messageRecordsToReturn.map((message) => message.id),
      })
    } else {
      for (const messageRecord of messageRecordsToReturn) {
        this.deliveryLeases.set(messageRecord.id, now + this.deliveryLeaseDurationMs)
      }
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

    await Promise.all(
      messageIds.map(async (messageId) => {
        try {
          await messageRepository.deleteById(agentContext, messageId)
        } catch (error) {
          // Delivery acknowledgements are allowed to be repeated. A concurrent
          // acknowledgement may have already removed this record, which is the
          // desired final state.
          if (!(error instanceof RecordNotFoundError)) throw error
        } finally {
          this.deliveryLeases.delete(messageId)
        }
      })
    )
  }

  private clearExpiredDeliveryLeases(now: number) {
    for (const [messageId, expiresAt] of this.deliveryLeases) {
      if (expiresAt <= now) this.deliveryLeases.delete(messageId)
    }
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
