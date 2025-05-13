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
    return await this.client.getMessageCount(connectionId)
  }

  public async takeFromQueue(options: TakeFromQueueOptions): Promise<Array<QueuedMessage>> {
    return await this.client.getMessages(options)
  }

  // TODO: will be added in credo
  public async addMessage(options: AddMessageOptions & { receivedAt?: Date }): Promise<string> {
    const id = await this.client.addMessage({
      timestamp: options.receivedAt ?? new Date(),
      connectionId: options.connectionId,
      encryptedMessage: options.payload,
      recipientDids: options.recipientDids,
    })

    return id
  }

  public async removeMessages(options: RemoveMessagesOptions): Promise<void> {
    await this.client.removeMessages({
      connectionId: options.connectionId,
      timestamps: options.messageIds.map((id) => new Date(Number(id))),
    })
  }
}
