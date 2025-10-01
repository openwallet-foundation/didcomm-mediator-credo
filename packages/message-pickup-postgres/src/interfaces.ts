import { Logger } from '@credo-ts/core'
import { BaseEvent } from '@credo-ts/core'
import { DidCommEncryptedMessage } from '@credo-ts/didcomm'
import { DidCommMessagePickupSession } from '@credo-ts/didcomm/build/modules/message-pickup/DidCommMessagePickupSession'

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
