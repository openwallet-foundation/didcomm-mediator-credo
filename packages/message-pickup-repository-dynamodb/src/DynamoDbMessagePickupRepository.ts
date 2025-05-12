import {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  MessagePickupRepository,
  QueuedMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/core'
import { Client } from './client'

export class DynamoDbMessagePickupRepository implements MessagePickupRepository {
  private client: Client

  public constructor() {
    this.client = new Client({})
  }

  getAvailableMessageCount({ connectionId }: GetAvailableMessageCountOptions): Promise<number> {
    return this.client.getPendingMessagesCountForConnectionId(connectionId)
  }

  takeFromQueue(options: TakeFromQueueOptions): Promise<QueuedMessage[]> {
    return this.client.getPendingMessagesForConnectionId(options)
  }
  addMessage(options: AddMessageOptions): Promise<string> {
    throw new Error('Method not implemented.')
  }
  removeMessages(options: RemoveMessagesOptions): Promise<void> {
    throw new Error('Method not implemented.')
  }
}
