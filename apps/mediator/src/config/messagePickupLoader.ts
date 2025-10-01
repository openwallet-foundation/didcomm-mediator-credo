import { Agent } from '@credo-ts/core'
import { DidCommQueueTransportRepository } from '@credo-ts/didcomm'
import { DynamoDbMessagePickupRepository } from '@credo-ts/didcomm-message-pickup-dynamodb'
import { PostgresMessagePickupRepository } from '@credo-ts/didcomm-message-pickup-postgres'
import { config, logger } from '../config'
import { StorageServiceMessageQueue } from '../storage/StorageMessageQueue'

export interface ExtendedQueueTransportRepository extends DidCommQueueTransportRepository {
  initialize?: (agent: Agent) => Promise<void>
}

export async function loadMessagePickupStorage(): Promise<ExtendedQueueTransportRepository> {
  const { storage } = config.messagePickup

  if (storage.type === 'dynamodb') {
    logger.info('Using dynamodb message pickup storage')
    return await DynamoDbMessagePickupRepository.initialize({
      region: storage.region,
      tableName: storage.tableName,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    })
  }

  if (storage.type === 'postgres') {
    logger.info('Using postgres message pickup storage')
    return new PostgresMessagePickupRepository({
      postgresHost: storage.host,
      postgresUser: storage.user,
      postgresPassword: storage.password,
      postgresDatabaseName: storage.database,
      logger,
    })
  }

  logger.info('Using credo message pickup storage')
  return new StorageServiceMessageQueue()
}
