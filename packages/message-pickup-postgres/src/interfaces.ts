import { Logger } from '@credo-ts/core'
import { EncryptedMessage } from '@credo-ts/didcomm'
import { MessagePickupSession } from '@credo-ts/didcomm/build/modules/message-pickup/MessagePickupSession'

export interface PostgresMessagePickupRepositoryConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string
}

export const MessageQueuedEventType: string = 'MessagePickupRepositoryMessageQueued'

export interface MessageQueuedEvent {
  message: {
    id: string
    connectionId: string
    recipientDids: string[]
    encryptedMessage: EncryptedMessage
    receivedAt: Date
    state: string
  }
  session?: MessagePickupSession
}

export interface ExtendedMessagePickupSession extends MessagePickupSession {
  isLocalSession: boolean
}
