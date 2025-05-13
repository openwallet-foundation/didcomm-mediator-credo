import { randomUUID } from 'node:crypto'
import {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/core'
import { DynamodbClientRepository, DynamodbClientRepositoryOptions } from './client'

export class DynamoDbMessagePickupRepository implements MessagePickupRepository {
  private client: DynamodbClientRepository

  private constructor(client: DynamodbClientRepository) {
    this.client = client
  }

  public static async initialize(options: { dynamoDbRepositoryOptions: DynamodbClientRepositoryOptions }) {
    return new DynamoDbMessagePickupRepository(
      await DynamodbClientRepository.initialize(options.dynamoDbRepositoryOptions)
    )
  }

  public async getAvailableMessageCount({ connectionId }: GetAvailableMessageCountOptions): Promise<number> {
    return await this.client.getEntriesCount(connectionId)
  }

  public async takeFromQueue(options: TakeFromQueueOptions): Promise<Array<QueuedMessage>> {
    return await this.client.getEntries(options)
  }

  public async addMessage(options: AddMessageOptions): Promise<string> {
    const id = randomUUID()
    await this.client.addMessage({
      id,
      connectionId: options.connectionId,
      encryptedMessage: options.payload,
      recipientDids: options.recipientDids,
    })
    return id
  }

  public async removeMessages(options: RemoveMessagesOptions): Promise<void> {
    await this.client.removeMessages(options)
  }
}
