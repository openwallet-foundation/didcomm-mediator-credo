import { AttributeDefinition, KeySchemaElement, KeyType, ScalarAttributeType } from '@aws-sdk/client-dynamodb'
import { QueuedMessage as CredoQueuedMessage } from '@credo-ts/core'

// TODO: should this be the type from credo?
export type QueuedMessage = CredoQueuedMessage & {
  connectionId: string
  recipientDids: Array<string>
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
