import { randomUUID } from 'node:crypto'
import { Container, CosmosClient, Database, PartitionKeyDefinitionVersion, PartitionKeyKind } from '@azure/cosmos'
import { Logger } from '@credo-ts/core'
import { DidCommEncryptedMessage } from '@credo-ts/didcomm'
import { QueuedMessageDocument, toQueuedDidCommMessage } from './structure.js'

export type AddQueuedMessageOptions = {
  connectionId: string
  receivedAt?: Date
  recipientDids: string[]
  encryptedMessage: DidCommEncryptedMessage
}

export type RemoveQueuedMessageOptions = {
  connectionId: string
  messageIds: Array<string>
}

export type CosmosDbClientRepositoryOptions = {
  /**
   * The Cosmos DB endpoint URL
   * e.g., https://your-account.documents.azure.com:443/
   */
  endpoint: string

  /**
   * The Cosmos DB account key for authentication
   * Can be primary or secondary key from Azure portal
   */
  key: string

  /**
   * The database name to use
   * @default 'didcomm-mediator'
   */
  databaseName?: string

  /**
   * The container (collection) name to use
   * @default 'queued_messages'
   */
  containerName?: string

  /**
   * Logger instance for debugging
   */
  logger: Logger
}

export class CosmosDbClientRepository {
  private cosmosClient: CosmosClient
  private database!: Database
  private container!: Container
  private databaseName: string
  private containerName: string
  private logger: Logger
  private initialized = false

  private constructor(options: CosmosDbClientRepositoryOptions) {
    this.cosmosClient = new CosmosClient({
      endpoint: options.endpoint,
      key: options.key,
    })
    this.databaseName = options.databaseName ?? 'didcomm-mediator'
    this.containerName = options.containerName ?? 'queued_messages'
    this.logger = options.logger
  }

  public static async initialize(options: CosmosDbClientRepositoryOptions): Promise<CosmosDbClientRepository> {
    const client = new CosmosDbClientRepository(options)
    await client.setupDatabaseAndContainer()
    return client
  }

  private async setupDatabaseAndContainer(): Promise<void> {
    try {
      // Create database if it doesn't exist
      const { database } = await this.cosmosClient.databases.createIfNotExists({
        id: this.databaseName,
      })
      this.database = database
      this.logger.debug(`[CosmosDB] Database '${this.databaseName}' ready`)

      // Create container if it doesn't exist
      // Using connectionId as partition key for efficient queries per connection
      const { container } = await this.database.containers.createIfNotExists({
        id: this.containerName,
        partitionKey: {
          paths: ['/connectionId'],
          kind: PartitionKeyKind.Hash,
          version: PartitionKeyDefinitionVersion.V2,
        },
        // Define indexing policy for efficient queries
        indexingPolicy: {
          indexingMode: 'consistent',
          automatic: true,
          includedPaths: [{ path: '/*' }],
          excludedPaths: [{ path: '/encryptedMessage/*' }, { path: '/"_etag"/?' }],
        },
      })
      this.container = container
      this.initialized = true
      this.logger.debug(`[CosmosDB] Container '${this.containerName}' ready`)
    } catch (error) {
      this.logger.error('[CosmosDB] Error setting up database and container:', { error })
      throw error
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CosmosDbClientRepository not initialized. Call initialize() first.')
    }
  }

  async getMessageCount(connectionId: string): Promise<number> {
    this.ensureInitialized()

    try {
      const querySpec = {
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.connectionId = @connectionId',
        parameters: [{ name: '@connectionId', value: connectionId }],
      }

      const { resources } = await this.container.items.query<number>(querySpec).fetchAll()

      return resources[0] || 0
    } catch (error) {
      this.logger.error('[CosmosDB] Error getting message count:', { error })
      throw error
    }
  }

  async getMessages(options: {
    connectionId: string
    limit?: number
    recipientDid?: string
    deleteMessages?: boolean
  }) {
    this.ensureInitialized()

    try {
      let query = 'SELECT * FROM c WHERE c.connectionId = @connectionId'
      const parameters: { name: string; value: string | number }[] = [
        { name: '@connectionId', value: options.connectionId },
      ]

      if (options.recipientDid) {
        query += ' AND ARRAY_CONTAINS(c.recipientDids, @recipientDid)'
        parameters.push({ name: '@recipientDid', value: options.recipientDid })
      }

      query += ' ORDER BY c.receivedAt'

      if (options.limit && options.limit > 0) {
        query += ' OFFSET 0 LIMIT @limit'
        parameters.push({ name: '@limit', value: options.limit })
      }

      const querySpec = { query, parameters }
      const { resources } = await this.container.items
        .query<QueuedMessageDocument>(querySpec, {
          partitionKey: options.connectionId,
        })
        .fetchAll()

      const messages = resources.map(toQueuedDidCommMessage)

      if (options.deleteMessages && messages.length > 0) {
        await this.removeMessages({
          connectionId: options.connectionId,
          messageIds: messages.map((m) => m.id),
        })
      }

      return messages
    } catch (error) {
      this.logger.error('[CosmosDB] Error getting messages:', { error })
      throw error
    }
  }

  async addMessage(options: AddQueuedMessageOptions): Promise<string> {
    this.ensureInitialized()

    try {
      const receivedAt = options.receivedAt ?? new Date()
      const messageId = randomUUID()

      const document: QueuedMessageDocument = {
        id: messageId,
        connectionId: options.connectionId,
        messageId,
        encryptedMessage: options.encryptedMessage,
        recipientDids: options.recipientDids,
        receivedAt: receivedAt.getTime(),
      }

      await this.container.items.create(document)

      return messageId
    } catch (error) {
      this.logger.error('[CosmosDB] Error adding message:', { error })
      throw error
    }
  }

  async removeMessages(options: RemoveQueuedMessageOptions): Promise<void> {
    this.ensureInitialized()

    try {
      const deletePromises = options.messageIds.map(async (messageId) => {
        const documentId = messageId
        try {
          await this.container.item(documentId, options.connectionId).delete()
        } catch (error) {
          // Handle case where document might not exist (already deleted)
          if ((error as { code?: number }).code === 404) {
            this.logger.debug(`[CosmosDB] Message ${documentId} already deleted or not found`)
            return
          }
          throw error
        }
      })

      await Promise.all(deletePromises)
    } catch (error) {
      this.logger.error('[CosmosDB] Error removing messages:', { error })
      throw error
    }
  }
}
