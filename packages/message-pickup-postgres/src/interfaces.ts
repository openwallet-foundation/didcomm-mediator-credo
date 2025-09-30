import { Logger } from '@credo-ts/core'
import { BaseEvent } from '@credo-ts/core'
import { EncryptedMessage } from '@credo-ts/didcomm'
import { MessagePickupSession } from '@credo-ts/didcomm/build/modules/message-pickup/MessagePickupSession'

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
      encryptedMessage: EncryptedMessage
      receivedAt: Date
      state: 'pending' | 'sending'
    }
    session?: MessagePickupSession
  }
}

export interface ExtendedMessagePickupSession extends MessagePickupSession {
  isLocalSession: boolean
}
