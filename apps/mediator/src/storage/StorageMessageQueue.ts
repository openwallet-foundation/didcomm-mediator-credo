import { Agent, AgentContext, EventEmitter, RecordNotFoundError, utils } from '@credo-ts/core'
import {
  AddMessageOptions,
  DidCommMessagePickupEventTypes,
  DidCommQueueTransportRepository,
  GetAvailableMessageCountOptions,
  MessagePickupLiveSessionRemovedEvent,
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
   * Leases are instance-local, including when Credo storage is shared across
   * instances with Redis multi-instance delivery. Redis routes delivery to the
   * instance owning the live session. Reconnecting to another instance can
   * redeliver in-flight messages, preserving at-least-once delivery semantics.
   * Leases are released when a live session is removed and expire as a fallback
   * so unacknowledged messages remain recoverable.
   */
  private readonly deliveryLeases = new Map<string, { connectionId: string; expiresAt: number }>()
  private readonly ackTimeoutMs: number

  public constructor(options: { ackTimeoutMs?: number } = {}) {
    this.ackTimeoutMs = options.ackTimeoutMs ?? 60_000
  }

  public async initialize(agent: Agent): Promise<void> {
    agent.events.on(
      DidCommMessagePickupEventTypes.LiveSessionRemoved,
      (event: MessagePickupLiveSessionRemovedEvent) => {
        this.releaseLeases(event.payload.session.connectionId)
      }
    )
  }

  public releaseLeases(connectionId: string): void {
    for (const [messageId, lease] of this.deliveryLeases) {
      if (lease.connectionId === connectionId) this.deliveryLeases.delete(messageId)
    }
  }

  public async getAvailableMessageCount(agentContext: AgentContext, options: GetAvailableMessageCountOptions) {
    const { connectionId } = options

    const messageRepository = agentContext.resolve(MessageRepository)
    const messageRecords = await messageRepository.findByConnectionId(agentContext, connectionId)

    this.clearExpiredDeliveryLeases(Date.now())
    const availableMessageCount = messageRecords.filter(
      (messageRecord) => !this.deliveryLeases.has(messageRecord.id)
    ).length

    agentContext.config.logger.debug(
      `Found ${availableMessageCount} available messages for connection ${connectionId}`
    )

    return availableMessageCount
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
        this.deliveryLeases.set(messageRecord.id, { connectionId, expiresAt: now + this.ackTimeoutMs })
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
    for (const [messageId, lease] of this.deliveryLeases) {
      if (lease.expiresAt <= now) this.deliveryLeases.delete(messageId)
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
