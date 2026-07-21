import { ScanHandle } from '@openwallet-foundation/askar-nodejs';
import { Client } from 'pg'

export interface PgClientLike {
  connect(): Promise<unknown>
  query(queryText: string): Promise<{ rows: Array<{ connection_id: unknown }> }>
  end(): Promise<unknown>
}

export interface WalletConnection {
  uri: string
  connect(): Promise<void>
  close(): Promise<void>
}

export interface PickupRepositoryConnection {
  connectionString: string
}

export interface AskarRecord {
  name: string
  valueJson: Record<string, unknown>
  tags?: Record<string, string> | null
}

export interface AskarSession {
  fetchAll(category: string, options?: { tagFilter?: Record<string, string>; limit?: number }): Promise<AskarRecord[]>
  remove(category: string, name: string): Promise<void>
  replace(options: {
    category: string
    name: string
    valueJson: Record<string, unknown>
    tags?: Record<string, string> | null
  }): Promise<void>
}

export interface AskarStore {
  fetchAll(category: string, options?: { tagFilter?: Record<string, string>; limit?: number }): Promise<AskarRecord[]>
  scanStart(category: string, options?: { tagFilter?: Record<string, string>; offset?: number; limit?: number }): Promise<ScanHandle>
  scanNext(scanHandle: ScanHandle): Promise<AskarRecord[] | null>
  scanFree(scanHandle: ScanHandle): void
  count(category: string, tagFilter?: Record<string, string>): Promise<number>
  withSession<T>(callback: (session: AskarSession) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export interface AskarStoreFactory {
  open(options: {
    uri: string
    passKey: string
    keyMethod?: string
  }): Promise<AskarStore>
}

export interface Logger {
  log(message: string): void
  error(message: string): void
}

export interface CredoMediatorPrunerOptions {
  conn: WalletConnection
  pickupRepoConn: PickupRepositoryConnection
  walletKey: string
  walletKeyDerivationMethod?: string
  inactiveDaysThreshold?: number
  ignoreProjectId?: string
  storeFactory?: AskarStoreFactory
  pgClientFactory?: (config: ConstructorParameters<typeof Client>[0]) => PgClientLike
  logger?: Logger
}

const defaultLogger: Logger = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
}

export function parseIsoDatetime(value: string): Date {
  const normalized = hasExplicitOffset(value) ? value : `${value}+00:00`
  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO datetime: ${value}`)
  }

  return parsed
}

export function formatUtcDatetime(value: Date): string {
  return value.toISOString()
}

export function getConnectionActivityTime(
  connectionValue: Record<string, unknown>,
  connectionTags?: Record<string, string> | null
): Date | null {
  const nestedTags = asRecord(connectionValue._tags)
  const lastSeenTime = connectionTags?.lastSeen ?? asString(nestedTags?.lastSeen)
  if (lastSeenTime) {
    return parseIsoDatetime(lastSeenTime)
  }

  const updatedAt = asString(connectionValue.updatedAt)
  if (updatedAt) {
    return parseIsoDatetime(updatedAt)
  }

  const createdAt = asString(connectionValue.createdAt)
  if (createdAt) {
    return parseIsoDatetime(createdAt)
  }

  return null
}

export class CredoMediatorPruner {
  private readonly conn: WalletConnection
  private readonly pickupRepoConn: PickupRepositoryConnection
  private readonly walletKey: string
  private readonly walletKeyDerivationMethod: string
  private readonly inactiveDaysThreshold: number
  private readonly ignoreProjectId: string | undefined
  private readonly storeFactory: AskarStoreFactory
  private readonly pgClientFactory: NonNullable<CredoMediatorPrunerOptions['pgClientFactory']>
  private readonly logger: Logger

  public constructor(options: CredoMediatorPrunerOptions) {
    this.conn = options.conn
    this.pickupRepoConn = options.pickupRepoConn
    this.walletKey = options.walletKey
    this.walletKeyDerivationMethod = options.walletKeyDerivationMethod ?? 'ARGON2I_MOD'
    this.inactiveDaysThreshold = options.inactiveDaysThreshold ?? 365
    this.storeFactory = options.storeFactory ?? missingStoreFactory()
    this.pgClientFactory = options.pgClientFactory ?? ((config) => new Client(config))
    this.ignoreProjectId = options.ignoreProjectId
    this.logger = options.logger ?? defaultLogger
  }

  public async prune(): Promise<void> {
    this.logger.log('Pruning mediator wallet...')

    const now = new Date()
    const store = await this.storeFactory.open({
      uri: this.conn.uri,
      passKey: this.walletKey,
      keyMethod: this.walletKeyDerivationMethod,
    })

    const dbConn = this.pgClientFactory({ connectionString: this.pickupRepoConn.connectionString })

    try {
      await dbConn.connect()
      await this.conn.connect()

      const queuedResult = await dbConn.query('SELECT DISTINCT connection_id FROM queued_message')
      const connectionsWithQueuedMessages = new Set(
        queuedResult.rows.map((row: { connection_id: unknown }) => String(row.connection_id))
      )

      let deleted = 0
      const batchSize = 500
      const totalCount = await store.count('ConnectionRecord')

      for (let offset = 0; offset < totalCount; offset += batchSize) {
        const scanHandle = await store.scanStart('ConnectionRecord', { limit: batchSize, offset })

        try {
          let batch = await store.scanNext(scanHandle)

          while (batch) {
            for (const connectionRecord of batch) {
              await store.withSession(async (session) => {
                try {
                  if (connectionsWithQueuedMessages.has(connectionRecord.name)) {
                    this.logger.log(
                      `Skipping connection record with id ${connectionRecord.name} because it has queued messages`
                    )
                    return
                  }

                  const firebaseRecord = await session.fetchAll('PushNotificationsFcmRecord', {
                    tagFilter: { connectionId: connectionRecord.name },
                    limit: 1,
                  })

                  if (!firebaseRecord[0]) {
                    this.logger.log(
                      `Skipping connection record with id ${connectionRecord.name} because it has no PushNotificationsFcmRecord`
                    )
                    return
                  }

                  const firebaseProjectId = asString(firebaseRecord[0].valueJson?.firebaseProjectId)
                  if (this.ignoreProjectId && firebaseProjectId === this.ignoreProjectId) {
                    this.logger.log(
                      `Skipping connection record with id ${connectionRecord.name} because it has a PushNotificationsFcmRecord with firebaseProjectId '${this.ignoreProjectId}'`
                    )
                    return
                  }

                  const activityTime = getConnectionActivityTime(connectionRecord.valueJson, connectionRecord.tags)

                  if (!activityTime) {
                    const connectionValue = { ...connectionRecord.valueJson, updatedAt: formatUtcDatetime(now) }
                    await session.replace({
                      category: 'ConnectionRecord',
                      name: connectionRecord.name,
                      valueJson: connectionValue,
                      tags: connectionRecord.tags,
                    })
                    this.logger.log(
                      `Backfilled updatedAt for connection record with id ${connectionRecord.name} to ${String(connectionValue.updatedAt)}`
                    )
                    return
                  }

                  const inactivityMs = this.inactiveDaysThreshold * 24 * 60 * 60 * 1000
                  if (now.getTime() - activityTime.getTime() > inactivityMs) {
                    const theirDid = asString(connectionRecord.valueJson.theirDid)
                    const did = asString(connectionRecord.valueJson.did)

                    await session.remove('ConnectionRecord', connectionRecord.name)

                    if (theirDid) {
                      const theirDidRecord = await session.fetchAll('DidRecord', {
                        tagFilter: { did: theirDid },
                        limit: 1,
                      })
                      if (theirDidRecord[0]) {
                        await session.remove('DidRecord', theirDidRecord[0].name)
                      }
                    }

                    if (did) {
                      const didRecord = await session.fetchAll('DidRecord', {
                        tagFilter: { did },
                        limit: 1,
                      })
                      if (didRecord[0]) {
                        await session.remove('DidRecord', didRecord[0].name)
                      }
                    }

                    const mediationRecord = await session.fetchAll('MediationRecord', {
                      tagFilter: { connectionId: connectionRecord.name },
                      limit: 1,
                    })
                    if (mediationRecord[0]) {
                      await session.remove('MediationRecord', mediationRecord[0].name)
                    }

                    const firebaseRecord = await session.fetchAll('PushNotificationsFcmRecord', {
                      tagFilter: { connectionId: connectionRecord.name },
                      limit: 1,
                    })
                    if (firebaseRecord[0]) {
                      await session.remove('PushNotificationsFcmRecord', firebaseRecord[0].name)
                    }

                    deleted += 1
                    this.logger.log(
                      `Deleted connection record with id ${connectionRecord.name} last active at ${activityTime.toISOString()} and associated records`
                    )
                  }
                } catch (error) {
                  this.logger.error(
                    `Error processing connection record with id ${connectionRecord.name}: ${formatError(error)}`
                  )
                }
              })
            }
            batch = await store.scanNext(scanHandle)
          }
        } finally {
          store.scanFree(scanHandle)
        }
      }

      this.logger.log(`Pruning complete. Scanned ${totalCount} connection records. Deleted ${deleted} connection and related records.`)
    } finally {
      await store.close()
      await this.conn.close()
      await dbConn.end()
    }
  }
}

function missingStoreFactory(): AskarStoreFactory {
  return {
    async open(): Promise<AskarStore> {
      throw new Error('No Askar store factory provided. Use createAskarNodeJsStoreFactory() or inject a test double.')
    },
  }
}

function hasExplicitOffset(value: string): boolean {
  return /(Z|[+-]\d{2}:\d{2})$/i.test(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return undefined
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
