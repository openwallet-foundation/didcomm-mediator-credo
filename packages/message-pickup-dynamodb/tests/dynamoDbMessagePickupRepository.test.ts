import { randomUUID } from 'node:crypto'
import { AgentContext, DependencyManager, EventEmitter } from '@credo-ts/core'
import { beforeAll, expect, suite, test } from 'vitest'
import { DynamoDbMessagePickupRepository } from '../src.js'

const agentContext = new AgentContext({
  contextCorrelationId: 'test',
  dependencyManager: new DependencyManager(),
})

agentContext.dependencyManager.registerInstance(EventEmitter, { emit: () => {} } as unknown as EventEmitter)

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
    messageId = await repository.addMessage(agentContext, {
      connectionId,
      payload: { ciphertext: 'a', iv: 'a', protected: 'a', tag: 'a' },
      recipientDids: ['did:web:example.org'],
    })
  })

  test('count available messages', async () => {
    const count = await repository.getAvailableMessageCount(agentContext, { connectionId })

    expect(count).toStrictEqual(1)
  })

  test('get all messages', async () => {
    const messages = await repository.takeFromQueue(agentContext, { connectionId })
    const count = await repository.getAvailableMessageCount(agentContext, { connectionId })

    expect(messages.length).toStrictEqual(1)
    expect(messages.length).toStrictEqual(count)
  })

  test('delete message', async () => {
    await repository.removeMessages(agentContext, { connectionId, messageIds: [messageId] })

    const count = await repository.getAvailableMessageCount(agentContext, { connectionId })

    expect(count).toStrictEqual(0)
  })
})
