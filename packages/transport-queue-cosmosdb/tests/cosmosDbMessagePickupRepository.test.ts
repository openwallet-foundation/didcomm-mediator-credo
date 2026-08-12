import { randomUUID } from 'node:crypto'
import { AgentContext, ConsoleLogger, DependencyManager, EventEmitter, LogLevel } from '@credo-ts/core'
import { beforeAll, expect, suite, test } from 'vitest'
import { DidCommTransportQueueCosmosDb } from '../src/index.js'

const agentContext = new AgentContext({
  contextCorrelationId: 'test',
  dependencyManager: new DependencyManager(),
})

agentContext.dependencyManager.registerInstance(EventEmitter, { emit: () => {} } as unknown as EventEmitter)

/**
 * These tests require a running Cosmos DB emulator or actual Cosmos DB instance.
 * For local development, use the Azure Cosmos DB Emulator:
 * https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator
 *
 * Default emulator settings:
 * - Endpoint: https://localhost:8081
 * - Key: C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
 */
suite('cosmosDbMessagePickupRepository', () => {
  let repository: DidCommTransportQueueCosmosDb | undefined
  const connectionId = randomUUID()
  let messageId: string
  let skipTests = false

  beforeAll(async () => {
    try {
      repository = await DidCommTransportQueueCosmosDb.initialize({
        logger: new ConsoleLogger(LogLevel.off),
        endpoint: process.env.COSMOSDB_ENDPOINT ?? 'https://localhost:8081',
        key:
          process.env.COSMOSDB_KEY ??
          'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
        databaseName: 'test-didcomm-mediator',
        containerName: 'test-queued-messages',
      })
    } catch {
      console.log('Skipping Cosmos DB tests - emulator not running')
      skipTests = true
    }
  })

  test('instantiate', async (ctx) => {
    if (skipTests) return ctx.skip()
    expect(repository).toBeDefined()
  })

  test('add message', async (ctx) => {
    if (skipTests || !repository) return ctx.skip()

    messageId = await repository.addMessage(agentContext, {
      connectionId,
      payload: { ciphertext: 'a', iv: 'a', protected: 'a', tag: 'a' },
      recipientDids: ['did:web:example.org'],
    })
  })

  test('count available messages', async (ctx) => {
    if (skipTests || !repository) return ctx.skip()

    const count = await repository.getAvailableMessageCount(agentContext, { connectionId })

    expect(count).toStrictEqual(1)
  })

  test('get all messages', async (ctx) => {
    if (skipTests || !repository) return ctx.skip()

    const messages = await repository.takeFromQueue(agentContext, { connectionId })
    const count = await repository.getAvailableMessageCount(agentContext, { connectionId })

    expect(messages.length).toStrictEqual(1)
    expect(messages.length).toStrictEqual(count)
  })

  test('delete message', async (ctx) => {
    if (skipTests || !repository) return ctx.skip()

    await repository.removeMessages(agentContext, { connectionId, messageIds: [messageId] })

    const count = await repository.getAvailableMessageCount(agentContext, { connectionId })

    expect(count).toStrictEqual(0)
  })
})
