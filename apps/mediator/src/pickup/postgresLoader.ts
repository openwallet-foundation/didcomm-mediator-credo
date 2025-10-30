import { TransportQueuePostgres } from '../../../../packages/transport-queue-postgres/src/TransportQueuePostgres'
import config from '../config'
import { askarPostgresConfig } from '../database'
import { Logger } from '../logger'
import { PickupLoader } from './loader'

const logger = new Logger(config.get('agent:logLevel'))

type DbConfig = {
  host: string
  user: string
  password: string
  databaseName?: string
}
export class PostgresPickupLoader extends PickupLoader {
  constructor() {
    super(JSON.parse(config.get('agent:pickup').settings))
  }

  getDatabaseConfig(): DbConfig {
    if (this.pickupConfig.useBaseConnection) {
      const storageConfig = config.get('db:host') ? askarPostgresConfig : undefined
      if (!storageConfig) {
        throw new Error(`Agent is configured to use base connection, but agent isn't using postgres.`)
      }
      return {
        host: storageConfig.config.host,
        user: config.get('db:user'),
        password: config.get('db:password'),
        databaseName: this.pickupConfig.postgresDatabaseName || '',
      }
    }
    if (!this.pickupConfig.postgresHost || !this.pickupConfig.postgresUser || !this.pickupConfig.postgresPassword) {
      throw new Error(
        'Postgres pickup configuration is incomplete. Please provide postgresHost, postgresUser, and postgresPassword.'
      )
    }
    return {
      host: this.pickupConfig.postgresHost,
      user: this.pickupConfig.postgresUser,
      password: this.pickupConfig.postgresPassword,
      databaseName: this.pickupConfig.postgresDatabaseName || '',
    }
  }

  async load(): Promise<TransportQueuePostgres> {
    logger.info('Loading transport queue postgres repository...')
    const databaseConfig = this.getDatabaseConfig()
    return new TransportQueuePostgres({
      postgresHost: databaseConfig.host,
      postgresUser: databaseConfig.user,
      postgresPassword: databaseConfig.password,
      postgresDatabaseName: databaseConfig.databaseName,
      logger: logger,
    })
  }
}
