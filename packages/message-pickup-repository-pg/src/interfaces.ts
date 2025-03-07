import { Logger} from '@credo-ts/core'

export interface PostgresMessagePickupRepositoryConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string
}

export const MessageQueuedEventType = 'MessageQueued';

export interface MessageQueuedEvent {
  connectionId: string
  messageId: string
}