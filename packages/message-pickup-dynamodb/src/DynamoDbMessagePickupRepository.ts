import { AgentContext } from '@credo-ts/core'
import {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  QueueTransportRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/didcomm'
import { DynamoDbClientRepository, DynamoDbClientRepositoryOptions } from './client'

export class DynamoDbMessagePickupRepository implements QueueTransportRepository {
  private client: DynamoDbClientRepository

  private constructor(client: DynamoDbClientRepository) {
    this.client = client
  }

  public static async initialize(options: DynamoDbClientRepositoryOptions) {
    return new DynamoDbMessagePickupRepository(await DynamoDbClientRepository.initialize(options))
  }

  public async getAvailableMessageCount(
    agentContext: AgentContext,
    { connectionId }: GetAvailableMessageCountOptions
  ): Promise<number> {
    return await this.client.getMessageCount(connectionId)
  }

  public async takeFromQueue(agentContext: AgentContext, options: TakeFromQueueOptions): Promise<Array<QueuedMessage>> {
    return await this.client.getMessages(options)
  }

  public async addMessage(agentContext: AgentContext, options: AddMessageOptions): Promise<string> {
    const id = await this.client.addMessage({
      ...options,
      encryptedMessage: options.payload,
    })

    return id
  }

  public async removeMessages(agentContext: AgentContext, options: RemoveMessagesOptions): Promise<void> {
    await this.client.removeMessages({
      connectionId: options.connectionId,
      messageIds: options.messageIds,
    })
  }
}
