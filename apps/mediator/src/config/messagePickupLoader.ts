import { Agent } from '@credo-ts/core'
import { DidCommQueueTransportRepository } from '@credo-ts/didcomm'
import { DidCommTransportQueueDynamoDb } from '@credo-ts/didcomm-transport-queue-dynamodb'
import { DidCommTransportQueuePostgres } from '@credo-ts/didcomm-transport-queue-postgres'
import { config, logger } from '../config.js'
import { StorageServiceMessageQueue } from '../storage/StorageMessageQueue.js'

export interface ExtendedQueueTransportRepository extends DidCommQueueTransportRepository {
  initialize?: (agent: Agent) => Promise<void>
}

export async function loadMessagePickupStorage(): Promise<ExtendedQueueTransportRepository> {
  const { storage } = config.messagePickup

  if (storage.type === 'dynamodb') {
    logger.info('Using dynamodb message pickup storage')
    return await DidCommTransportQueueDynamoDb.initialize({
      // Endpoint is not needed when deploying to AWS, but for local development it can be useful
      endpoint: storage.endpoint,
      logger,
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
    return new DidCommTransportQueuePostgres({
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
