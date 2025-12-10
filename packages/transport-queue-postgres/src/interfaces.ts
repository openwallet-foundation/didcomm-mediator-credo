import { BaseEvent, Logger } from '@credo-ts/core'
import { DidCommEncryptedMessage, DidCommMessagePickupSession } from '@credo-ts/didcomm'

export interface PostgresTransportQueuePostgresConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string
}

export const PostgresMessageQueuedEventType = 'TransportQueuePostgresMessageQueued' as const

export interface PostgresMessageQueuedEvent extends BaseEvent {
  type: typeof PostgresMessageQueuedEventType
  payload: {
    message: {
      id: string
      connectionId: string
      recipientDids: string[]
      encryptedMessage: DidCommEncryptedMessage
      receivedAt: Date
      state: 'pending' | 'sending'
    }
    session?: DidCommMessagePickupSession
  }
}

export interface ExtendedMessagePickupSession extends DidCommMessagePickupSession {
  isLocalSession: boolean
}
