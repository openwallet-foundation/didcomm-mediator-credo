import { AsyncLocalStorage } from 'node:async_hooks'

// This context is deliberately limited to ownership of the synchronous queue
// event emitted by processForwardMessage. It does not carry request data or
// correlate messages across transports.
const forwardDeliveryContext = new AsyncLocalStorage<boolean>()

export function runInForwardDeliveryContext<T>(callback: () => T): T {
  return forwardDeliveryContext.run(true, callback)
}

export function isInForwardDeliveryContext(): boolean {
  return forwardDeliveryContext.getStore() === true
}
