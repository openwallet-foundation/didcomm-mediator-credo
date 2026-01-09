import { QueuedDidCommMessage as CredoQueuedMessage } from '@credo-ts/didcomm'

// CredoQueuedMessage made Required right now, due to credo having them as optional, but we need it for efficient sorting
export type QueuedMessage = Required<CredoQueuedMessage> & {
  connectionId: string
  recipientDids: Array<string>
}

/**
 * Structure of a queued message document in Cosmos DB
 */
export interface QueuedMessageDocument {
  /** Unique identifier for the document (partition key + messageId) */
  id: string
  /** Connection ID (partition key) */
  connectionId: string
  /** Numeric message ID for ordering (timestamp-based) */
  messageId: number
  /** The encrypted DIDComm message */
  encryptedMessage: Record<string, unknown>
  /** Array of recipient DIDs */
  recipientDids: string[]
  /** Unix timestamp when the message was received */
  receivedAt: number
}
