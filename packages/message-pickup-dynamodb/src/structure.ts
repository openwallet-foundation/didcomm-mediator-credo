import { AttributeDefinition, KeySchemaElement, KeyType, ScalarAttributeType } from '@aws-sdk/client-dynamodb'
import { QueuedMessage as CredoQueuedMessage } from '@credo-ts/didcomm'

// CredoQueuedMessage made Required right now, due to credo having them as optional, but we need it for efficient sorting
export type QueuedMessage = Required<CredoQueuedMessage> & {
  connectionId: string
  recipientDids: Array<string>
}

export const attributeDefinitions: Array<AttributeDefinition> = [
  {
    AttributeName: 'connectionId',
    AttributeType: ScalarAttributeType.S,
  },
  {
    AttributeName: 'messageId',
    AttributeType: ScalarAttributeType.N,
  },
]

export const keySchema: Array<KeySchemaElement> = [
  {
    AttributeName: 'connectionId',
    KeyType: KeyType.HASH,
  },
  {
    AttributeName: 'messageId',
    KeyType: KeyType.RANGE,
  },
]
