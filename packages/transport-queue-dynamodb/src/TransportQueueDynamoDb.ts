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

export class DidCommTransportQueueDynamoDb implements DidCommQueueTransportRepository {
  private client: DynamoDbClientRepository

  private constructor(client: DynamoDbClientRepository) {
    this.client = client
  }

  public static async initialize(options: DynamoDbClientRepositoryOptions) {
    return new DidCommTransportQueueDynamoDb(await DynamoDbClientRepository.initialize(options))
  }

  public async getAvailableMessageCount(
    _agentContext: AgentContext,
    { connectionId }: GetAvailableMessageCountOptions
  ): Promise<number> {
    return await this.client.getMessageCount(connectionId)
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
