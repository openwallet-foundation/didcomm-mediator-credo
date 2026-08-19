import { describe, expect, test } from 'vitest'
import { isInForwardDeliveryContext, runInForwardDeliveryContext } from './forwardDeliveryContext.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe('forwardDeliveryContext', () => {
  test('is scoped to the forward-delivery asynchronous call chain', async () => {
    const contextStarted = deferred()
    const releaseContext = deferred()

    expect(isInForwardDeliveryContext()).toBe(false)

    const inContext = runInForwardDeliveryContext(async () => {
      expect(isInForwardDeliveryContext()).toBe(true)
      contextStarted.resolve()
      await releaseContext.promise
      expect(isInForwardDeliveryContext()).toBe(true)
    })

    await contextStarted.promise
    expect(isInForwardDeliveryContext()).toBe(false)

    releaseContext.resolve()
    await inContext
    expect(isInForwardDeliveryContext()).toBe(false)
  })
})
