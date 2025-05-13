import { randomUUID } from 'node:crypto'
import { EncryptedMessage } from '@credo-ts/core'
import { expect, suite, test } from 'vitest'
import { AddQueuedMessageOptions, DynamodbClientRepository } from '../src/client'

const connectionId = '4ffdd113-117b-4827-9af5-28aa73ec4bad'
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
    const timestamp = new Date()
    const id = await client.addMessage({
      connectionId: connectionId,
      timestamp,
      encryptedMessage,
      recipientDids: recipientDids,
    })

    expect(id).toStrictEqual(timestamp.getTime().toString())
  })

  test('get count', async () => {
    const count = await client.getMessageCount(connectionId)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('get a message', async () => {
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

  test('get a message and filter on recipient did', async () => {
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

  test('get message and remove a message', async () => {
    const count = await client.getMessageCount(connectionId)

    await client.getMessages({
      connectionId: connectionId,
      deleteMessages: true,
    })

    const countAfterDelete = await client.getMessageCount(connectionId)

    expect(count).toBeGreaterThan(countAfterDelete)
  })

  test('add and explicit delete', async () => {
    const now = new Date()
    await client.addMessage({
      connectionId,
      encryptedMessage,
      timestamp: now,
      recipientDids,
    })

    const count = await client.getMessageCount(connectionId)

    await client.removeMessages({ connectionId: connectionId, timestamps: [now] })

    const countAfterDelete = await client.getMessageCount(connectionId)

    expect(count - countAfterDelete).toStrictEqual(1)
  })

  test('update a messsage', async () => {
    const input: AddQueuedMessageOptions = {
      connectionId: randomUUID(),
      timestamp: new Date(),
      encryptedMessage: {
        ciphertext: 'a',
        iv: 'a',
        protected: 'a',
        tag: 'a',
      },
      recipientDids: ['a'],
    }

    await client.addMessage(input)

    const [message] = await client.getMessages({ connectionId: input.connectionId, limit: 1 })

    expect(message.encryptedMessage).toEqual({
      ciphertext: 'a',
      iv: 'a',
      protected: 'a',
      tag: 'a',
    })

    await client.addMessage({
      ...input,
      encryptedMessage: {
        ciphertext: 'b',
        iv: 'b',
        protected: 'b',
        tag: 'b',
      },
    })

    const [messageB] = await client.getMessages({ connectionId: input.connectionId, limit: 1 })

    expect(messageB.encryptedMessage).toEqual({
      ciphertext: 'b',
      iv: 'b',
      protected: 'b',
      tag: 'b',
    })
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
          timestamp: new Date(i),
        })
      )
    }

    await Promise.all(requests)

    const count = await client.getMessageCount(newConnectionId)
    expect(count).toStrictEqual(100)

    await client.removeMessages({
      connectionId: newConnectionId,
      timestamps: Array.from({ length: 101 }, (_, i) => new Date(i)),
    })

    const countAfterDelete = await client.getMessageCount(newConnectionId)
    expect(countAfterDelete).toStrictEqual(0)
  })
})
