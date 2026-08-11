import { AgentContext, EventEmitter } from '@credo-ts/core'
import {
  AddMessageOptions,
  DidCommQueueTransportRepository,
  GetAvailableMessageCountOptions,
  QueuedDidCommMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/didcomm'
import { DynamoDbClientRepository, DynamoDbClientRepositoryOptions } from './client.js'

export type DynamoDbTransportQueueOptions = DynamoDbClientRepositoryOptions & {
  /**
   * @default 10
   */
  maximumMessageCount?: number
}

export class DidCommTransportQueueDynamoDb implements DidCommQueueTransportRepository {
  private client: DynamoDbClientRepository
  private maximumMessageCount: number

  private constructor(client: DynamoDbClientRepository, maximumMessageCount: number) {
    this.client = client
    this.maximumMessageCount = maximumMessageCount
  }

  public static async initialize(options: DynamoDbTransportQueueOptions) {
    const { maximumMessageCount = 10, ...clientOptions } = options
    if (!Number.isInteger(maximumMessageCount) || maximumMessageCount < 1) {
      throw new Error('maximumMessageCount must be a positive integer')
    }

    return new DidCommTransportQueueDynamoDb(
      await DynamoDbClientRepository.initialize(clientOptions),
      maximumMessageCount
    )
  }

  public async getAvailableMessageCount(
    _agentContext: AgentContext,
    { connectionId, recipientDid }: GetAvailableMessageCountOptions
  ): Promise<number> {
    return await this.client.getMessageCount(connectionId, recipientDid, this.maximumMessageCount)
  }

  public async takeFromQueue(
    _agentContext: AgentContext,
    options: TakeFromQueueOptions
  ): Promise<Array<QueuedDidCommMessage>> {
    return await this.client.getMessages(options)
  }

  public async addMessage(agentContext: AgentContext, options: AddMessageOptions): Promise<string> {
    const id = await this.client.addMessage({
      ...options,
      encryptedMessage: options.payload,
    })

    this.emitMessageQueuedEvent(agentContext, options.connectionId)

    return id
  }

  public async removeMessages(_agentContext: AgentContext, options: RemoveMessagesOptions): Promise<void> {
    await this.client.removeMessages({
      connectionId: options.connectionId,
      messageIds: options.messageIds,
    })
  }

  private emitMessageQueuedEvent(agentContext: AgentContext, connectionId: string) {
    const eventEmitter = agentContext.resolve(EventEmitter)

    // NOTE: we can't import from the mediator repo. We might need a core repo
    // For now we just don't type it
    eventEmitter.emit(agentContext, {
      type: 'DidCommMessageQueued',
      payload: {
        connectionId,
      },
    })
  }
}
