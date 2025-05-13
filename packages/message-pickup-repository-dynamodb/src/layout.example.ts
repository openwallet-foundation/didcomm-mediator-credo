import { AttributeDefinition, KeySchemaElement, KeyType, ScalarAttributeType } from '@aws-sdk/client-dynamodb'
import { EncryptedMessage } from '@credo-ts/core'

export type tableQueuedMessages = {
  [connectionId: string]: {
    messages?: Array<QueuedMessage>
    liveSessions?: Array<LiveSession>
  }
}

export type QueuedMessageState = 'pending' | 'sending'

export type QueuedMessage = {
  id: string
  recipientDids: Array<string>
  encryptedMessage: EncryptedMessage
  state: QueuedMessageState
  receivedAt?: Date
}

export type LiveSession = {
  sessionId: string
  protocolVersion: string
  instance: string
}

export const attributeDefinitions: Array<AttributeDefinition> = [
  {
    AttributeName: 'connectionId',
    AttributeType: ScalarAttributeType.S,
  },
  {
    AttributeName: 'id',
    AttributeType: ScalarAttributeType.S,
  },
]

export const keySchema: Array<KeySchemaElement> = [
  {
    AttributeName: 'connectionId',
    KeyType: KeyType.HASH,
  },
  {
    AttributeName: 'id',
    KeyType: KeyType.RANGE,
  },
]
