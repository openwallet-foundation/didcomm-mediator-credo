import { Agent } from '@credo-ts/core'
import { DidCommQueueTransportRepository } from '@credo-ts/didcomm'
import { DidCommTransportQueueCosmosDb } from '@credo-ts/didcomm-transport-queue-cosmosdb'
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
    const { dynamodb } = config.messagePickup
    if (!dynamodb) throw new Error('DynamoDB message pickup configuration is missing')

    logger.info('Using dynamodb message pickup storage')
    return await DidCommTransportQueueDynamoDb.initialize({
      // Endpoint is not needed when deploying to AWS, but for local development it can be useful
      endpoint: dynamodb.endpoint,
      logger,
      region: dynamodb.region,
      tableName: dynamodb.tableName,
      credentials: {
        accessKeyId: dynamodb.accessKeyId,
        secretAccessKey: dynamodb.secretAccessKey,
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

  if (storage.type === 'cosmosdb') {
    const { cosmosdb } = config.messagePickup
    if (!cosmosdb) throw new Error('Cosmos DB message pickup configuration is missing')

    logger.info('Using cosmosdb message pickup storage')
    return await DidCommTransportQueueCosmosDb.initialize({
      endpoint: cosmosdb.endpoint,
      key: cosmosdb.key,
      databaseName: cosmosdb.databaseName,
      containerName: cosmosdb.containerName,
      logger,
    })
  }

  logger.info('Using credo message pickup storage')
  return new StorageServiceMessageQueue()
}
