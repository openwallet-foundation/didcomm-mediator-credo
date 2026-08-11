import { randomInt } from 'node:crypto'
import {
  CreateTableCommand,
  CreateTableCommandInput,
  DeleteItemCommand,
  DeleteItemCommandInput,
  DescribeTableCommand,
  DescribeTableCommandInput,
  DynamoDBClient,
  DynamoDBClientConfigType,
  QueryCommand,
  QueryCommandInput,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { Logger } from '@credo-ts/core'
import { DidCommEncryptedMessage } from '@credo-ts/didcomm'
import { attributeDefinitions, keySchema, QueuedMessage } from './structure.js'

export type AddQueuedMessageOptions = {
  connectionId: string
  receivedAt?: Date
  recipientDids: string[]
  encryptedMessage: DidCommEncryptedMessage
}

export type RemoveQueuedMessageOptions = {
  connectionId: string
  messageIds: Array<string>
}

export type DynamoDbClientRepositoryOptions = DynamoDBClientConfigType & {
  /**
   * @default queued_messages
   */
  tableName?: string

  logger: Logger
}

export class DynamoDbClientRepository {
  private dynamodbClient: DynamoDBClient
  private tableName: string
  private logger: Logger

  private constructor(options: DynamoDbClientRepositoryOptions) {
    this.dynamodbClient = new DynamoDBClient(options)
    this.tableName = options.tableName ?? 'queued_messages'
    this.logger = options.logger
  }

  public static async initialize(options: DynamoDbClientRepositoryOptions): Promise<DynamoDbClientRepository> {
    const dcr = new DynamoDbClientRepository(options)

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
      // Already exists
      if (error instanceof Error && error.name === 'ResourceInUseException') {
        await dcr.validateTableKeySchema()
        return dcr
      }
      throw error
    }

    return dcr
  }

  private async validateTableKeySchema(): Promise<void> {
    const response = await this.dynamodbClient.send(
      new DescribeTableCommand({
        TableName: this.tableName,
      })
    )

    const actualKeySchema = response.Table?.KeySchema
    const actualAttributeDefinitions = response.Table?.AttributeDefinitions
    const hasExpectedKeySchema =
      actualKeySchema?.length === keySchema.length &&
      keySchema.every((expectedKey) =>
        actualKeySchema.some(
          (actualKey) =>
            actualKey.AttributeName === expectedKey.AttributeName && actualKey.KeyType === expectedKey.KeyType
        )
      )
    const hasExpectedAttributeDefinitions = attributeDefinitions.every((expectedAttribute) =>
      actualAttributeDefinitions?.some(
        (actualAttribute) =>
          actualAttribute.AttributeName === expectedAttribute.AttributeName &&
          actualAttribute.AttributeType === expectedAttribute.AttributeType
      )
    )

    if (!hasExpectedKeySchema || !hasExpectedAttributeDefinitions) {
      throw new Error(
        `DynamoDB table ${this.tableName} has an incompatible schema. Expected key schema ${JSON.stringify(
          keySchema
        )} and attribute definitions ${JSON.stringify(attributeDefinitions)}, received key schema ${JSON.stringify(
          actualKeySchema
        )} and attribute definitions ${JSON.stringify(actualAttributeDefinitions)}`
      )
    }
  }

  private async getLatestMessageId(connectionId: string) {
    const response = await this.dynamodbClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'connectionId = :connectionId',
        ExpressionAttributeValues: {
          ':connectionId': { S: connectionId },
        },
        ProjectionExpression: 'messageId',
        Select: 'SPECIFIC_ATTRIBUTES',
        Limit: 1,
        ScanIndexForward: false,
      })
    )

    return response.Items?.[0]?.messageId
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

  async getMessageCount(connectionId: string, recipientDid?: string, maximumCount?: number): Promise<number> {
    try {
      const params: QueryCommandInput = {
        TableName: this.tableName,
        KeyConditionExpression: 'connectionId = :connectionId',
        ExpressionAttributeValues: {
          ':connectionId': { S: connectionId },
        },
        Select: 'COUNT',
      }

      if (recipientDid !== undefined) {
        const latestMessageId = await this.getLatestMessageId(connectionId)
        if (!latestMessageId) return 0

        params.KeyConditionExpression += ' AND messageId <= :latestMessageId'
        params.FilterExpression = 'contains(recipientDids, :recipientDid)'
        params.ExpressionAttributeValues = {
          ...params.ExpressionAttributeValues,
          ':recipientDid': { S: recipientDid },
          ':latestMessageId': latestMessageId,
        }
      } else {
        params.Limit = maximumCount
      }

      let count = 0
      let lastEvaluatedKey: QueryCommandInput['ExclusiveStartKey']

      do {
        const previousLastEvaluatedKey = lastEvaluatedKey
        const command = new QueryCommand({
          ...params,
          ExclusiveStartKey: lastEvaluatedKey,
        })
        const response = await this.dynamodbClient.send(command)

        count += response.Count || 0
        lastEvaluatedKey = response.LastEvaluatedKey

        if (maximumCount !== undefined && count >= maximumCount) {
          return maximumCount
        }

        if (
          lastEvaluatedKey &&
          previousLastEvaluatedKey &&
          JSON.stringify(lastEvaluatedKey) === JSON.stringify(previousLastEvaluatedKey)
        ) {
          throw new Error(
            `DynamoDB returned a non-advancing pagination key while counting messages for connection ${connectionId}`
          )
        }
      } while (lastEvaluatedKey)

      return count
    } catch (error) {
      this.logger.error('Error getting entries count:', { error })
      throw error
    }
  }

  async getMessages(options: {
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
    }

    if (options.recipientDid !== undefined) {
      const latestMessageId = await this.getLatestMessageId(options.connectionId)
      if (!latestMessageId) return []

      queryParams.KeyConditionExpression += ' AND messageId <= :latestMessageId'
      queryParams.FilterExpression = 'contains(recipientDids, :recipientDid)'
      queryParams.ExpressionAttributeValues = {
        ...queryParams.ExpressionAttributeValues,
        ':recipientDid': { S: options.recipientDid },
        ':latestMessageId': latestMessageId,
      }
    } else {
      queryParams.Limit = options.limit
    }

    const messages: QueuedMessage[] = []
    let lastEvaluatedKey: QueryCommandInput['ExclusiveStartKey']

    do {
      const response = await this.dynamodbClient.send(
        new QueryCommand({
          ...queryParams,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      )

      messages.push(
        ...(response.Items?.map((item) => unmarshall(item)) || []).map(
          (item) =>
            ({
              ...item,
              receivedAt: new Date(item.receivedAt),
              id: item.messageId.toString(),
            }) as unknown as QueuedMessage
        )
      )
      lastEvaluatedKey = response.LastEvaluatedKey
    } while (
      options.recipientDid !== undefined &&
      lastEvaluatedKey &&
      (options.limit === undefined || messages.length < options.limit)
    )

    const messagesToReturn = options.limit === undefined ? messages : messages.slice(0, options.limit)

    if (options.deleteMessages && messagesToReturn.length > 0) {
      await this.removeMessages({
        connectionId: options.connectionId,
        messageIds: messagesToReturn.map((m) => m.id),
      })
    }

    return messagesToReturn
  }

  async addMessage(options: AddQueuedMessageOptions): Promise<string> {
    const randomizer = randomInt(0, 999).toString().padStart(3, '0')
    const receivedAt = options.receivedAt ?? new Date()
    const messageId = `${receivedAt.getTime()}${randomizer}`
    const updateItemCommand = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({
        connectionId: options.connectionId,
        messageId: Number(messageId),
      }),
      UpdateExpression: 'set encryptedMessage = :em, recipientDids = :rd, receivedAt = :ra',
      ExpressionAttributeValues: marshall({
        ':em': options.encryptedMessage,
        ':rd': options.recipientDids,
        ':ra': receivedAt.getTime(),
      }),
    })

    await this.dynamodbClient.send(updateItemCommand)

    return messageId
  }

  async removeMessages(options: RemoveQueuedMessageOptions): Promise<void> {
    const deleteRequests = options.messageIds.map((messageId) => {
      const deleteParams: DeleteItemCommandInput = {
        TableName: this.tableName,
        Key: marshall({
          connectionId: options.connectionId,
          messageId: Number(messageId),
        }),
      }

      return this.dynamodbClient.send(new DeleteItemCommand(deleteParams))
    })

    await Promise.all(deleteRequests)
  }
}
