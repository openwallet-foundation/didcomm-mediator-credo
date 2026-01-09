import { ConsoleLogger, LogLevel } from '@credo-ts/core'
import { DidCommEncryptedMessage } from '@credo-ts/didcomm'
import { beforeAll, expect, suite, test } from 'vitest'
import { CosmosDbClientRepository } from '../src/client.js'

const connectionId = '4ffdd113-117b-4827-9af5-28aa73ec4bad'
const recipientDids = ['did:key:123', 'did:jwk:123', 'did:peer:3abba']
const encryptedMessage: DidCommEncryptedMessage = {
  ciphertext: 'ciphertext',
  iv: 'iv',
  protected: 'protected',
  tag: 'tag',
}

/**
 * These tests require a running Cosmos DB emulator or actual Cosmos DB instance.
 * For local development, use the Azure Cosmos DB Emulator:
 * https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator
 *
 * Default emulator settings:
 * - Endpoint: https://localhost:8081
 * - Key: C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
 */
suite('cosmosdb client', () => {
  let client: CosmosDbClientRepository | undefined
  let skipTests = false

  beforeAll(async () => {
    // Skip tests if Cosmos DB emulator is not running
    try {
      client = await CosmosDbClientRepository.initialize({
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

  test('initialize', async (ctx) => {
    if (skipTests) return ctx.skip()
    expect(client).toBeDefined()
  })

  test('add a message', async (ctx) => {
    if (skipTests || !client) return ctx.skip()

    const timestamp = new Date()
    const id = await client.addMessage({
      connectionId: connectionId,
      receivedAt: timestamp,
      encryptedMessage,
      recipientDids: recipientDids,
    })

    expect(id.startsWith(timestamp.getTime().toString())).toBeTruthy()
  })

  test('get count', async (ctx) => {
    if (skipTests || !client) return ctx.skip()

    const count = await client.getMessageCount(connectionId)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('get a message', async (ctx) => {
    if (skipTests || !client) return ctx.skip()

    const messages = await client.getMessages({
      connectionId: connectionId,
      limit: 1,
    })

    expect(messages.length).toStrictEqual(1)

    const [message] = messages

    expect(message.connectionId).toStrictEqual(connectionId)
    expect(message.receivedAt).toBeInstanceOf(Date)
    expect(message.encryptedMessage).toEqual(encryptedMessage)
    expect(message.recipientDids).toEqual(recipientDids)
  })

  test('get a message and filter on recipient did', async (ctx) => {
    if (skipTests || !client) return ctx.skip()

    const messages = await client.getMessages({
      connectionId: connectionId,
      limit: 1,
      recipientDid: recipientDids[0],
    })

    expect(messages.length).toStrictEqual(1)

    const [message] = messages

    expect(message.connectionId).toStrictEqual(connectionId)
    expect(message.receivedAt).toBeInstanceOf(Date)
    expect(message.encryptedMessage).toEqual(encryptedMessage)
    expect(message.recipientDids).toEqual(recipientDids)
  })

  test('get message and remove a message', async (ctx) => {
    if (skipTests || !client) return ctx.skip()

    const count = await client.getMessageCount(connectionId)

    await client.getMessages({
      connectionId: connectionId,
      deleteMessages: true,
    })

    const countAfterDelete = await client.getMessageCount(connectionId)

    expect(count).toBeGreaterThan(countAfterDelete)
  })

  test('add and explicit delete', async (ctx) => {
    if (skipTests || !client) return ctx.skip()

    const id = await client.addMessage({
      connectionId,
      encryptedMessage,
      receivedAt: new Date(),
      recipientDids,
    })

    const countBefore = await client.getMessageCount(connectionId)

    await client.removeMessages({
      connectionId,
      messageIds: [id],
    })

    const countAfter = await client.getMessageCount(connectionId)

    expect(countBefore).toBeGreaterThan(countAfter)
  })
})
