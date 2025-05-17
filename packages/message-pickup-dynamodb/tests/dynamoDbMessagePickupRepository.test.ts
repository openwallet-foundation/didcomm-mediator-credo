import { randomUUID } from 'node:crypto'
import { beforeAll, expect, suite, test } from 'vitest'
import { DynamoDbMessagePickupRepository } from '../src'

suite('dynamoDbMessagePickupRepository', () => {
  let repository: DynamoDbMessagePickupRepository
  const connectionId = randomUUID()
  let messageId: string

  beforeAll(async () => {
    repository = await DynamoDbMessagePickupRepository.initialize({
      region: 'local',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    })
  })

  test('instantiate', async () => {
    expect(repository).toBeDefined()
  })

  test('add message', async () => {
    messageId = await repository.addMessage({
      connectionId,
      payload: { ciphertext: 'a', iv: 'a', protected: 'a', tag: 'a' },
      recipientDids: ['did:web:example.org'],
    })
  })

  test('count available messages', async () => {
    const count = await repository.getAvailableMessageCount({ connectionId })

    expect(count).toStrictEqual(1)
  })

  test('get all messages', async () => {
    const messages = await repository.takeFromQueue({ connectionId })
    const count = await repository.getAvailableMessageCount({ connectionId })

    expect(messages.length).toStrictEqual(1)
    expect(messages.length).toStrictEqual(count)
  })

  test('delete message', async () => {
    await repository.removeMessages({ connectionId, messageIds: [messageId] })

    const count = await repository.getAvailableMessageCount({ connectionId })

    expect(count).toStrictEqual(0)
  })
})
