import { randomUUID } from 'node:crypto'
import {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/core'
import { DynamodbClientRepository } from './client'

export class DynamoDbMessagePickupRepository implements MessagePickupRepository {
  private client: DynamodbClientRepository

  private constructor(client: DynamodbClientRepository) {
    this.client = client
  }

  public static async initialize() {
    new DynamoDbMessagePickupRepository(await DynamodbClientRepository.initialize({}))
  }

  public async getAvailableMessageCount({ connectionId }: GetAvailableMessageCountOptions): Promise<number> {
    return this.client.getEntriesCount(connectionId)
  }

  public async takeFromQueue(options: TakeFromQueueOptions): Promise<Array<{ connectionId: string } & QueuedMessage>> {
    return this.client.getEntries(options)
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
    return await this.client.removeMessages(options)
  }
}
