import { Logger } from '@credo-ts/core'

export interface ConnectionInfo {
  handleNotificationEvent?: (messageId: string) => Promise<void>
}

export interface PostgresMessagePickupRepositoryConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string
}
