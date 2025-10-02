import { BaseEvent } from '@credo-ts/core'

export enum MediatorEventTypes {
  DidCommMessageQueued = 'DidCommMessageQueued',
}

export interface DidcommMessageQueuedEvent extends BaseEvent {
  type: MediatorEventTypes.DidCommMessageQueued
  payload: {
    connectionId: string
  }
}
