import {
  CreateTableCommand,
  CreateTableCommandInput,
  DeleteItemCommand,
  DeleteItemCommandInput,
  DescribeTableCommand,
  DescribeTableCommandInput,
  DynamoDBClient,
  DynamoDBClientConfigType,
  PutItemCommand,
  QueryCommand,
  QueryCommandInput,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { EncryptedMessage } from '@credo-ts/core'
import { QueuedMessage, attributeDefinitions, keySchema } from './layout.example'

export type AddQueuedMessageOptions = {
  connectionId: string
  id: string
  recipientDids: string[]
  encryptedMessage: EncryptedMessage
}

export type RemoveQueuedMessageOptions = {
  connectionId: string
  messageIds: string[]
}

export type DynamodbClientRepositoryOptions = DynamoDBClientConfigType

export class DynamodbClientRepository {
  private dynamodbClient: DynamoDBClient
  private tableName = 'queued_messages'

  private constructor(options: DynamoDBClientConfigType) {
    this.dynamodbClient = new DynamoDBClient(options)
  }

  public static async initialize(options: DynamoDBClientConfigType): Promise<DynamodbClientRepository> {
    const dcr = new DynamodbClientRepository(options)

    const params: CreateTableCommandInput = {
      TableName: dcr.tableName,
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,

      // TODO: correctly define these numbers
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
      },
    }

    try {
      const command = new CreateTableCommand(params)
      await dcr.dynamodbClient.send(command)
      await dcr.waitForTableToExist()
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceInUseException') {
        return dcr
      }
      throw error
    }

    return dcr
  }

  private async waitForTableToExist(): Promise<void> {
    const startTime = Date.now()
    const maxWaitTime = 30000

    return new Promise((resolve, reject) => {
      const checkTableStatus = async () => {
        try {
          const describeParams: DescribeTableCommandInput = {
            TableName: this.tableName,
          }
          const command = new DescribeTableCommand(describeParams)
          const response = await this.dynamodbClient.send(command)

          if (response.Table?.TableStatus === 'ACTIVE') {
            resolve()
            return
          }

          if (Date.now() - startTime > maxWaitTime) {
            reject(new Error(`Table ${this.tableName} did not become active within ${maxWaitTime}ms`))
            return
          }

          setTimeout(checkTableStatus, 500)
        } catch (error) {
          reject(error)
        }
      }

      checkTableStatus()
    })
  }

  async getEntriesCount(connectionId: string): Promise<number> {
    const params: ScanCommandInput = {
      TableName: this.tableName,
      FilterExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: {
        ':connectionId': { S: connectionId },
      },
      Select: 'COUNT',
    }

    try {
      const command = new ScanCommand(params)
      const response = await this.dynamodbClient.send(command)
      return response.Count || 0
    } catch (error) {
      console.error('Error getting entries count:', error)
      throw error
    }
  }

  async getEntries(options: {
    connectionId: string
    limit?: number
    recipientDid?: string
    deleteMessages?: boolean
  }) {
    const queryParams: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'connectionId = :connectionId',
      ExpressionAttributeValues: {
        ':connectionId': { S: options.connectionId },
      },
      Limit: options.limit,
    }

    if (options.recipientDid) {
      queryParams.FilterExpression = 'contains(recipientDids, :recipientDid)'

      if (queryParams.ExpressionAttributeValues) {
        queryParams.ExpressionAttributeValues[':recipientDid'] = { S: options.recipientDid }
      }
    }

    const command = new QueryCommand(queryParams)
    const response = await this.dynamodbClient.send(command)

    const messages = response.Items?.map((item) => unmarshall(item) as { connectionId: string } & QueuedMessage) || []

    if (options.deleteMessages && messages.length > 0) {
      await this.removeMessages({ connectionId: options.connectionId, messageIds: messages.map((m) => m.id) })
    }

    return messages
  }

  async addMessage(options: AddQueuedMessageOptions): Promise<void> {
    const putItemCommand = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall({
        connectionId: options.connectionId,
        id: options.id,
        state: 'pending',
        receivedAt: new Date().getTime(),
        encryptedMessage: options.encryptedMessage,
        recipientDids: options.recipientDids,
      }),
    })

    await this.dynamodbClient.send(putItemCommand)
  }

  async removeMessages(options: RemoveQueuedMessageOptions): Promise<void> {
    const deleteRequests = options.messageIds.map((messageId) => {
      const deleteParams: DeleteItemCommandInput = {
        TableName: this.tableName,
        Key: marshall({
          connectionId: options.connectionId,
          id: messageId,
        }),
      }

      return this.dynamodbClient.send(new DeleteItemCommand(deleteParams))
    })

    await Promise.all(deleteRequests)
  }
}
