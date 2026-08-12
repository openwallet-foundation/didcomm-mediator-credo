import { DidCommEncryptedMessage, QueuedDidCommMessage } from '@credo-ts/didcomm'

export type QueuedMessage = QueuedDidCommMessage & {
  connectionId: string
  recipientDids: string[]
}

/**
 * Structure of a queued message document in Cosmos DB
 */
export interface QueuedMessageDocument {
  /** Unique identifier for the document */
  id: string
  /** Connection ID (partition key) */
  connectionId: string
  /** Queue message ID */
  messageId: string
  /** The encrypted DIDComm message */
  encryptedMessage: DidCommEncryptedMessage
  /** Array of recipient DIDs */
  recipientDids: string[]
  /** Unix timestamp when the message was received */
  receivedAt: number
}

export function toQueuedDidCommMessage(document: unknown): QueuedMessage {
  if (!isQueuedMessageDocument(document)) {
    throw new Error('Invalid queued message document returned by Cosmos DB')
  }

  return {
    id: document.messageId,
    connectionId: document.connectionId,
    receivedAt: new Date(document.receivedAt),
    encryptedMessage: document.encryptedMessage,
    recipientDids: document.recipientDids,
  }
}

function isQueuedMessageDocument(document: unknown): document is QueuedMessageDocument {
  if (!isRecord(document)) return false

  return (
    typeof document.id === 'string' &&
    typeof document.connectionId === 'string' &&
    typeof document.messageId === 'string' &&
    typeof document.receivedAt === 'number' &&
    Array.isArray(document.recipientDids) &&
    document.recipientDids.every((recipientDid) => typeof recipientDid === 'string') &&
    isDidCommEncryptedMessage(document.encryptedMessage)
  )
}

function isDidCommEncryptedMessage(message: unknown): message is DidCommEncryptedMessage {
  return (
    isRecord(message) &&
    typeof message.protected === 'string' &&
    typeof message.iv === 'string' &&
    typeof message.ciphertext === 'string' &&
    typeof message.tag === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
