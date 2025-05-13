import { EncryptedMessage } from '@credo-ts/core'
import { expect, suite, test } from 'vitest'
import { DynamodbClientRepository } from '../src/client'

const connectionId = '4ffdd113-117b-4827-9af5-28aa73ec4bad'
const messageId = 'fd7cf337-66ba-4dc7-88fc-4f5c6fd9ce57'
const recipientDids = ['did:key:123', 'did:jwk:123', 'did:peer:3abba']
const encryptedMessage: EncryptedMessage = {
  ciphertext: 'ciphertext',
  iv: 'iv',
  protected: 'protected',
  tag: 'tag',
}

suite('dynamodb client', () => {
  let client: DynamodbClientRepository

  test('initialize', async () => {
    client = await DynamodbClientRepository.initialize({
      region: 'local',
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    })

    expect(client).toBeDefined()
  })

  test('add a message', async () => {
    await client.addMessage({
      connectionId: connectionId,
      encryptedMessage,
      id: messageId,
      recipientDids: recipientDids,
    })
  })

  test('get count', async () => {
    const count = await client.getEntriesCount(connectionId)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('get a message', async () => {
    const messages = await client.getEntries({
      connectionId: connectionId,
      limit: 1,
    })

    expect(messages.length).toStrictEqual(1)

    const [message] = messages

    expect(message.connectionId).toStrictEqual(connectionId)
    expect(message.id).toStrictEqual(messageId)
    expect(message.receivedAt).toBeTypeOf('number')
    expect(message.encryptedMessage).toEqual(encryptedMessage)
    expect(message.recipientDids).toEqual(recipientDids)
  })

  test('get a message and filter on recipient did', async () => {
    const messages = await client.getEntries({
      connectionId: connectionId,
      limit: 1,
      recipientDid: recipientDids[0],
    })

    expect(messages.length).toStrictEqual(1)

    const [message] = messages

    expect(message.connectionId).toStrictEqual(connectionId)
    expect(message.id).toStrictEqual(messageId)
    expect(message.receivedAt).toBeTypeOf('number')
    expect(message.encryptedMessage).toEqual(encryptedMessage)
    expect(message.recipientDids).toEqual(recipientDids)
  })

  test('get message and remove a message', async () => {
    const count = await client.getEntriesCount(connectionId)

    await client.getEntries({
      connectionId: connectionId,
      deleteMessages: true,
    })

    const countAfterDelete = await client.getEntriesCount(connectionId)

    expect(count).toBeGreaterThan(countAfterDelete)
  })

  test('add and explicit delete', async () => {
    await client.addMessage({
      connectionId,
      encryptedMessage,
      id: messageId,
      recipientDids,
    })

    const count = await client.getEntriesCount(connectionId)

    await client.removeMessages({ connectionId: connectionId, messageIds: [messageId] })

    const countAfterDelete = await client.getEntriesCount(connectionId)

    expect(count - countAfterDelete).toStrictEqual(1)
  })

  test('add and delete bunch of messages', async () => {
    const newConnectionId = 'new-connection-id'
    const requests: Array<Promise<void>> = []
    for (let i = 0; i < 100; i++) {
      requests.push(
        client.addMessage({
          connectionId: newConnectionId,
          recipientDids,
          encryptedMessage,
          id: `${i}`,
        })
      )
    }

    await Promise.all(requests)

    const count = await client.getEntriesCount(newConnectionId)
    expect(count).toStrictEqual(100)

    await client.removeMessages({
      connectionId: newConnectionId,
      messageIds: Array.from({ length: 101 }, (_, i) => `${i}`),
    })

    const countAfterDelete = await client.getEntriesCount(newConnectionId)
    expect(countAfterDelete).toStrictEqual(0)
  })
})
