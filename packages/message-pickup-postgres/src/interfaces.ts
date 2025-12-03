import { BaseEvent, Logger } from '@credo-ts/core'
import { DidCommEncryptedMessage, DidCommMessagePickupSession } from '@credo-ts/didcomm'

export interface PostgresMessagePickupRepositoryConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string
}

export const PostgresMessagePickupMessageQueuedEventType = 'PostgresMessagePickupRepositoryMessageQueued' as const

export interface PostgresMessagePickupMessageQueuedEvent extends BaseEvent {
  type: typeof PostgresMessagePickupMessageQueuedEventType
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
