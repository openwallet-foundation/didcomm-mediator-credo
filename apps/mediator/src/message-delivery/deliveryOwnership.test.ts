import { DidCommMessageForwardingStrategy } from '@credo-ts/didcomm'
import { describe, expect, test } from 'vitest'
import { shouldCredoOwnLocalDelivery } from './deliveryOwnership.js'

describe('shouldCredoOwnLocalDelivery', () => {
  test('assigns only local QueueAndLive forward events to Credo', () => {
    expect(
      shouldCredoOwnLocalDelivery({
        forwardingStrategy: DidCommMessageForwardingStrategy.QueueAndLiveModeDelivery,
        hasLocalSession: true,
        isForwardQueueEvent: true,
      })
    ).toBe(true)

    expect(
      shouldCredoOwnLocalDelivery({
        forwardingStrategy: DidCommMessageForwardingStrategy.QueueAndLiveModeDelivery,
        hasLocalSession: true,
        isForwardQueueEvent: false,
      })
    ).toBe(false)

    expect(
      shouldCredoOwnLocalDelivery({
        forwardingStrategy: DidCommMessageForwardingStrategy.QueueOnly,
        hasLocalSession: true,
        isForwardQueueEvent: true,
      })
    ).toBe(false)

    expect(
      shouldCredoOwnLocalDelivery({
        forwardingStrategy: DidCommMessageForwardingStrategy.QueueAndLiveModeDelivery,
        hasLocalSession: false,
        isForwardQueueEvent: true,
      })
    ).toBe(false)
  })
})
