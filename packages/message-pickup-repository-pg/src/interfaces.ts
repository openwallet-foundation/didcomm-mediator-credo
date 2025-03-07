import { EncryptedMessage, Logger} from '@credo-ts/core'
import { MessagePickupSession } from '@credo-ts/core/build/modules/message-pickup/MessagePickupSession'

export interface PostgresMessagePickupRepositoryConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string
}

export const MessageQueuedEventType: string = 'MessageQueued';

export interface MessageQueuedEvent {
  connectionId: string
  messageId: string
  payload: EncryptedMessage;
  session?: MessagePickupSession;
}