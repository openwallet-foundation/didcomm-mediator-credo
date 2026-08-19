import { DidCommMessageForwardingStrategy } from '@credo-ts/didcomm'

export function shouldCredoOwnLocalDelivery({
  forwardingStrategy,
  hasLocalSession,
  isForwardQueueEvent,
}: {
  forwardingStrategy: DidCommMessageForwardingStrategy
  hasLocalSession: boolean
  isForwardQueueEvent: boolean
}): boolean {
  return (
    forwardingStrategy === DidCommMessageForwardingStrategy.QueueAndLiveModeDelivery &&
    isForwardQueueEvent &&
    hasLocalSession
  )
}
