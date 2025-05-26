import { PostgresMessagePickupRepository } from '../../../../packages/message-pickup-repository-pg/src/PostgresMessagePickupRepository'
import config from '../config'
import { Logger } from '../logger'
import { askarPostgresConfig } from '../database'
import { PickupLoader } from './loader'
import { database } from 'firebase-admin'

const storageConfig = config.get('db:host') ? askarPostgresConfig : undefined
const logger = new Logger(config.get('agent:logLevel'))

export class PostgresPickupLoader extends PickupLoader {
    constructor() {
        super(JSON.parse(config.get('agent:pickup').settings))
    }

    getDatabaseConfig(): any {
        if (this.pickupConfig.useBaseConnection) {
            const storageConfig = config.get('db:host') ? askarPostgresConfig : undefined
            if (!storageConfig) {
                throw new Error(`Agent is configured to use base connection, but agent isn't using postgres.`)
            }
            return {
                host: storageConfig.config.host,
                user : config.get('db:user'),
                password: config.get('db:password'),
                databaseName: config.get('db:databaseName') || '',
            }
        }
        return {
            host: this.pickupConfig.postgresHost,
            user: this.pickupConfig.postgresUser,
            password: this.pickupConfig.postgresPassword,
            databaseName: this.pickupConfig.postgresDatabaseName || '',
        }
    }

    async load(): Promise<PostgresMessagePickupRepository> {
        logger.info('Loading Postgres message pickup repository...')

        const databaseConfig = this.getDatabaseConfig()

        return new PostgresMessagePickupRepository({
            postgresHost: databaseConfig.host,
            postgresUser: databaseConfig.user,
            postgresPassword: databaseConfig.password,
            postgresDatabaseName: databaseConfig.databaseName,
            logger: logger,
        })
    }

}