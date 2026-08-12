import { describe, expect, test } from 'vitest'
import { toQueuedDidCommMessage } from '../src/structure.js'

describe('toQueuedDidCommMessage', () => {
  test('converts a valid Cosmos DB document', () => {
    const receivedAt = Date.now()
    const message = toQueuedDidCommMessage({
      id: 'document-id',
      messageId: 'message-id',
      connectionId: 'connection-id',
      receivedAt,
      recipientDids: ['did:example:recipient'],
      encryptedMessage: {
        protected: 'protected',
        iv: 'iv',
        ciphertext: 'ciphertext',
        tag: 'tag',
      },
    })

    expect(message).toMatchObject({
      id: 'message-id',
      connectionId: 'connection-id',
      recipientDids: ['did:example:recipient'],
    })
    expect(message.receivedAt).toEqual(new Date(receivedAt))
  })

  test('rejects a document with an incomplete encrypted message', () => {
    expect(() =>
      toQueuedDidCommMessage({
        id: 'document-id',
        messageId: 'message-id',
        connectionId: 'connection-id',
        receivedAt: Date.now(),
        recipientDids: ['did:example:recipient'],
        encryptedMessage: {},
      })
    ).toThrow('Invalid queued message document returned by Cosmos DB')
  })
})
