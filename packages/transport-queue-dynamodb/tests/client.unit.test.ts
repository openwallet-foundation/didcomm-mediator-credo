import { CreateTableCommand, DescribeTableCommand, DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { AgentContext, ConsoleLogger, DependencyManager, LogLevel } from '@credo-ts/core'
import { expect, suite, test, vi } from 'vitest'
import { DynamoDbClientRepository } from '../src/client.js'
import { DidCommTransportQueueDynamoDb } from '../src/TransportQueueDynamoDb.js'

const connectionId = '4ffdd113-117b-4827-9af5-28aa73ec4bad'
const recipientDid = 'did:key:123'
const clientOptions = {
  logger: new ConsoleLogger(LogLevel.off),
  region: 'local',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
}

suite('dynamodb client count query', () => {
  test('validates the key schema of an existing table', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof CreateTableCommand) {
        throw Object.assign(new Error('Table already exists'), { name: 'ResourceInUseException' })
      }

      return {
        Table: {
          AttributeDefinitions: [
            { AttributeName: 'connectionId', AttributeType: 'S' },
            { AttributeName: 'messageId', AttributeType: 'N' },
          ],
          KeySchema: [
            { AttributeName: 'connectionId', KeyType: 'HASH' },
            { AttributeName: 'messageId', KeyType: 'RANGE' },
          ],
        },
      } as never
    })

    try {
      await expect(DynamoDbClientRepository.initialize(clientOptions)).resolves.toBeDefined()
    } finally {
      send.mockRestore()
    }
  })

  test('rejects an existing table with an incompatible key schema', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof CreateTableCommand) {
        throw Object.assign(new Error('Table already exists'), { name: 'ResourceInUseException' })
      }

      return {
        Table: {
          AttributeDefinitions: [
            { AttributeName: 'connectionId', AttributeType: 'S' },
            { AttributeName: 'messageId', AttributeType: 'S' },
          ],
          KeySchema: [
            { AttributeName: 'connectionId', KeyType: 'HASH' },
            { AttributeName: 'messageId', KeyType: 'RANGE' },
          ],
        },
      } as never
    })

    try {
      await expect(DynamoDbClientRepository.initialize(clientOptions)).rejects.toThrow('incompatible schema')
    } finally {
      send.mockRestore()
    }
  })

  test('paginates exact counts and caps pickup counts at the requested maximum', async () => {
    const lastEvaluatedKey = {
      connectionId: { S: connectionId },
      messageId: { N: '2' },
    }
    const countResponses = [
      { Count: 2, LastEvaluatedKey: lastEvaluatedKey },
      { Count: 3 },
      { Count: 2, LastEvaluatedKey: lastEvaluatedKey },
      { Count: 3 },
    ]
    let countQueryCount = 0
    const send = vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof CreateTableCommand) return {} as never
      if (command instanceof DescribeTableCommand) return { Table: { TableStatus: 'ACTIVE' } } as never
      if (command instanceof QueryCommand && command.input.Select === 'SPECIFIC_ATTRIBUTES') {
        return { Items: [{ messageId: { N: '3' } }] } as never
      }

      return countResponses[countQueryCount++] as never
    })

    try {
      const client = await DynamoDbClientRepository.initialize(clientOptions)

      expect(await client.getMessageCount(connectionId)).toStrictEqual(5)
      expect(await client.getMessageCount(connectionId, undefined, 2)).toStrictEqual(2)
      expect(await client.getMessageCount(connectionId, recipientDid, 10)).toStrictEqual(3)

      const queryCommands = send.mock.calls.filter(([command]) => command instanceof QueryCommand)
      const firstCommand = queryCommands[0][0] as QueryCommand
      expect(firstCommand.input).toMatchObject({
        TableName: 'queued_messages',
        KeyConditionExpression: 'connectionId = :connectionId',
        ExpressionAttributeValues: {
          ':connectionId': { S: connectionId },
        },
        Select: 'COUNT',
      })
      expect(firstCommand.input).not.toHaveProperty('FilterExpression')
      expect(firstCommand.input.ExclusiveStartKey).toBeUndefined()

      const secondCommand = queryCommands[1][0] as QueryCommand
      expect(secondCommand.input.ExclusiveStartKey).toStrictEqual(lastEvaluatedKey)

      const cappedCommand = queryCommands[2][0] as QueryCommand
      expect(cappedCommand.input.Limit).toStrictEqual(2)

      const latestMessageCommand = queryCommands[3][0] as QueryCommand
      expect(latestMessageCommand.input).toMatchObject({
        Limit: 1,
        ProjectionExpression: 'messageId',
        ScanIndexForward: false,
        Select: 'SPECIFIC_ATTRIBUTES',
      })

      const recipientCommand = queryCommands[4][0] as QueryCommand
      expect(recipientCommand.input).toMatchObject({
        KeyConditionExpression: 'connectionId = :connectionId AND messageId <= :latestMessageId',
        FilterExpression: 'contains(recipientDids, :recipientDid)',
        ExpressionAttributeValues: {
          ':recipientDid': { S: recipientDid },
        },
      })
      expect(recipientCommand.input.Limit).toBeUndefined()
    } finally {
      send.mockRestore()
    }
  })

  test('throws for a non-advancing pagination key', async () => {
    const lastEvaluatedKey = {
      connectionId: { S: connectionId },
      messageId: { N: '2' },
    }
    let countQueryCount = 0
    const send = vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof CreateTableCommand) return {} as never
      if (command instanceof DescribeTableCommand) return { Table: { TableStatus: 'ACTIVE' } } as never

      countQueryCount += 1
      return {
        Count: 1,
        LastEvaluatedKey: lastEvaluatedKey,
      } as never
    })

    try {
      const client = await DynamoDbClientRepository.initialize(clientOptions)

      await expect(client.getMessageCount(connectionId)).rejects.toThrow('non-advancing pagination key')
      expect(countQueryCount).toStrictEqual(2)
    } finally {
      send.mockRestore()
    }
  })

  test('uses the configured pickup count ceiling without requiring a DI registration', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(async (command) => {
      if (command instanceof CreateTableCommand) return {} as never
      if (command instanceof DescribeTableCommand) return { Table: { TableStatus: 'ACTIVE' } } as never

      return { Count: 2, LastEvaluatedKey: { connectionId: { S: connectionId } } } as never
    })

    try {
      const repository = await DidCommTransportQueueDynamoDb.initialize({
        ...clientOptions,
        maximumMessageCount: 2,
      })
      const agentContext = new AgentContext({
        contextCorrelationId: 'test',
        dependencyManager: new DependencyManager(),
      })

      expect(await repository.getAvailableMessageCount(agentContext, { connectionId })).toStrictEqual(2)

      const queryCommand = send.mock.calls.find(([command]) => command instanceof QueryCommand)?.[0] as QueryCommand
      expect(queryCommand.input.Limit).toStrictEqual(2)
    } finally {
      send.mockRestore()
    }
  })
})
