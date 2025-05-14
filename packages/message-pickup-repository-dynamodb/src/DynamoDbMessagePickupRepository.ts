import {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/core'
import { DynamoDbClientRepository, DynamoDbClientRepositoryOptions } from './client'

export class DynamoDbMessagePickupRepository implements MessagePickupRepository {
  private client: DynamoDbClientRepository

  private constructor(client: DynamoDbClientRepository) {
    this.client = client
  }

  public static async initialize(options: DynamoDbClientRepositoryOptions) {
    return new DynamoDbMessagePickupRepository(await DynamoDbClientRepository.initialize(options))
  }

  public async getAvailableMessageCount({ connectionId }: GetAvailableMessageCountOptions): Promise<number> {
    return await this.client.getMessageCount(connectionId)
  }

  public async takeFromQueue(options: TakeFromQueueOptions): Promise<Array<QueuedMessage>> {
    return await this.client.getMessages(options)
  }

  // TODO: will be added in credo
  public async addMessage(options: AddMessageOptions & { receivedAt?: Date }): Promise<string> {
    const id = await this.client.addMessage({
      ...options,
      encryptedMessage: options.payload,
    })

    return id
  }

  public async removeMessages(options: RemoveMessagesOptions): Promise<void> {
    await this.client.removeMessages({
      connectionId: options.connectionId,
      messageIds: options.messageIds,
    })
  }
}
