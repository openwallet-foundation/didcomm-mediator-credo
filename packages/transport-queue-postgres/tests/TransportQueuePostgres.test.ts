import { Agent, AgentContext, BaseEvent, ConsoleLogger, EventEmitter, LogLevel } from '@credo-ts/core'
import { DidCommMessagePickupApi, DidCommMessagePickupEventTypes } from '@credo-ts/didcomm'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DidCommTransportQueuePostgres, PostgresMessagesPendingEventType } from '../src/index.js'

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number }
type QueryHandler = (sql: string, params?: unknown[]) => QueryResult | undefined

const db = vi.hoisted(() => ({
  pool: [] as QueryHandler[],
  client: [] as QueryHandler[],
  poolQueries: [] as { sql: string; params?: unknown[] }[],
  clientQueries: [] as { sql: string; params?: unknown[] }[],
  listeners: new Map<string, (payload: string) => Promise<void>>(),
  published: [] as [string, string][],
}))

vi.mock('pg', () => {
  const run = (handlers: QueryHandler[], log: { sql: string; params?: unknown[] }[]) => {
    return async (sql: string, params?: unknown[]): Promise<QueryResult> => {
      log.push({ sql, params })
      for (const handler of handlers) {
        const result = handler(sql, params)
        if (result) return result
      }
      return { rows: [], rowCount: 0 }
    }
  }
  return {
    Pool: class {
      public query = run(db.pool, db.poolQueries)
      public async connect() {
        return { query: run(db.client, db.clientQueries), release: () => {} }
      }
      public async end() {}
    },
  }
})

vi.mock('pg-pubsub', () => ({
  default: class {
    public async addChannel(channel: string, callback: (payload: string) => Promise<void>) {
      db.listeners.set(channel, callback)
    }
    public async publish(channel: string, payload: string) {
      db.published.push([channel, payload])
    }
  },
}))

vi.mock('../src/utils/buildPgDatabaseWithMigrations.js', () => ({ buildPgDatabaseWithMigrations: async () => {} }))

const connectionId = '8a1f0c55-2b7e-4c1c-9e34-3f5b2a7d9e01'
const session = { id: 'session-1', connectionId, protocolVersion: 'v2', role: 'MessageHolder' }
const payload = { protected: 'p', iv: 'i', ciphertext: 'c', tag: 't' }

describe('DidCommTransportQueuePostgres delivery guarantees', () => {
  let queue: DidCommTransportQueuePostgres
  let agentContext: AgentContext
  let agent: Agent
  let logger: ConsoleLogger
  let emitted: BaseEvent[]
  let agentHandlers: Map<string, (event: unknown) => Promise<void>>
  const pickupApi = {
    getLiveModeSession: vi.fn(),
    deliverMessages: vi.fn(),
    deliverMessagesFromQueue: vi.fn(),
  }

  const pendingEvents = () => emitted.filter((e) => e.type === PostgresMessagesPendingEventType).map((e) => e.payload)
  const lockAcquired: QueryHandler = (sql) =>
    sql.includes('pg_try_advisory_lock') ? { rows: [{ pg_try_advisory_lock: true }], rowCount: 1 } : undefined

  beforeEach(() => {
    db.pool.length = 0
    db.client.length = 0
    db.poolQueries.length = 0
    db.clientQueries.length = 0
    db.listeners.clear()
    db.published.length = 0
    emitted = []
    agentHandlers = new Map()
    pickupApi.getLiveModeSession.mockReset().mockResolvedValue(undefined)
    pickupApi.deliverMessages.mockReset().mockResolvedValue(undefined)
    pickupApi.deliverMessagesFromQueue.mockReset().mockResolvedValue(undefined)

    logger = new ConsoleLogger(LogLevel.Off)
    vi.spyOn(logger, 'warn')
    vi.spyOn(logger, 'error')
    agentContext = {
      config: { logger },
      resolve: (token: unknown) => {
        if (token === DidCommMessagePickupApi) return pickupApi
        if (token === EventEmitter) return { emit: (_context: AgentContext, event: BaseEvent) => emitted.push(event) }
        throw new Error(`Unexpected dependency ${String(token)}`)
      },
    } as unknown as AgentContext
    agent = {
      context: agentContext,
      events: { on: (type: string, handler: (event: unknown) => Promise<void>) => agentHandlers.set(type, handler) },
    } as unknown as Agent

    queue = new DidCommTransportQueuePostgres({
      logger,
      postgresUser: 'user',
      postgresPassword: 'password',
      postgresHost: 'localhost',
      ackTimeoutMs: 1500,
    })
  })

  afterEach(async () => {
    await queue.shutdown(agentContext)
  })

  test('a failed live delivery in the pub/sub listener does not reject', async () => {
    pickupApi.getLiveModeSession.mockResolvedValue(session)
    pickupApi.deliverMessagesFromQueue.mockRejectedValue(new Error('WebSocket transport session has been closed.'))
    await queue.initialize(agent)

    const listener = db.listeners.get('newMessage')
    await expect(listener?.(connectionId)).resolves.toBeUndefined()
    expect(pickupApi.deliverMessagesFromQueue).toHaveBeenCalledWith({ pickupSessionId: session.id })
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to deliver queued messages'))
    expect(pendingEvents()).toEqual([])
  })

  test('a failed live delivery in addMessage keeps the forward, moves the message back to pending and wakes the owner', async () => {
    pickupApi.getLiveModeSession.mockResolvedValue(session)
    pickupApi.deliverMessages.mockRejectedValue(new Error('WebSocket send message failed.'))
    db.pool.push((sql) =>
      sql.includes('INSERT INTO queued_message') ? { rows: [{ id: 'm1' }], rowCount: 1 } : undefined
    )
    await queue.initialize(agent)

    await expect(queue.addMessage(agentContext, { connectionId, recipientDids: [], payload })).resolves.toBe('m1')

    const insert = db.poolQueries.find((q) => q.sql.includes('INSERT INTO queued_message'))
    const revert = db.poolQueries.find((q) => q.sql.includes("SET state = 'pending'") && q.sql.includes('id = $1'))
    expect(revert?.params).toEqual(['m1', insert?.params?.[5]])
    expect(revert?.sql).toContain("state = 'sending' AND instance = $2")
    expect(revert?.sql).toContain('sending_since = NULL')
    expect(db.published).toEqual([['newMessage', connectionId]])
    expect(pendingEvents()).toEqual([{ connectionId }])
  })

  test('moving a message to sending records when and how many times', async () => {
    pickupApi.getLiveModeSession.mockResolvedValue(session)
    db.pool.push((sql) =>
      sql.includes('INSERT INTO queued_message') ? { rows: [{ id: 'm1' }], rowCount: 1 } : undefined
    )
    await queue.initialize(agent)

    await queue.addMessage(agentContext, { connectionId, recipientDids: [], payload })
    const insert = db.poolQueries.find((q) => q.sql.includes('INSERT INTO queued_message'))
    expect(insert?.sql).toContain('sending_since, attempts')
    expect(insert?.params?.slice(3)).toEqual(['sending', expect.any(Date), expect.any(String), true, 1])

    await queue.takeFromQueue(agentContext, { connectionId, limit: 10 })
    const take = db.poolQueries.find((q) => q.sql.includes("SET state = 'sending'"))
    expect(take?.sql).toContain('sending_since = now(), attempts = attempts + 1')
  })

  test('the reaper moves unacked messages back to pending, wakes their owners and warns on repeated attempts', async () => {
    const other = '2b9d4c11-7a3e-4f0b-8c55-1d2e3f4a5b6c'
    db.client.push(lockAcquired, (sql) =>
      sql.includes('RETURNING id, connection_id, attempts')
        ? {
            rows: [
              { id: 'm1', connection_id: connectionId, attempts: 1 },
              { id: 'm2', connection_id: connectionId, attempts: 6 },
              { id: 'm3', connection_id: other, attempts: 2 },
            ],
            rowCount: 3,
          }
        : undefined
    )
    await queue.initialize(agent)

    const sweep = db.clientQueries.find((q) => q.sql.includes('RETURNING id, connection_id, attempts'))
    expect(sweep?.params).toEqual([1500])
    expect(sweep?.sql).toContain('sending_since = NULL')
    expect(db.published).toEqual([
      ['newMessage', connectionId],
      ['newMessage', other],
    ])
    expect(pendingEvents()).toEqual([{ connectionId }, { connectionId: other }])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('m2 (connectionId'))
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('m1 (connectionId'))
  })

  test('the reaper gives every sending message without sending_since a full ack timeout', async () => {
    db.client.push(lockAcquired)
    await queue.initialize(agent)

    const sqls = db.clientQueries.map((q) => q.sql)
    const stamp = sqls.findIndex((sql) => sql.includes('SET sending_since = now()'))
    const sweep = sqls.findIndex((sql) => sql.includes('RETURNING id, connection_id, attempts'))
    expect(sqls[stamp]).toContain("state = 'sending' AND sending_since IS NULL")
    expect(sqls[stamp]).not.toContain('created_at')
    expect(stamp).toBeLessThan(sweep)
    expect(sqls[sweep]).not.toContain('created_at')
  })

  test('the sending index is built concurrently and replaces an invalid one', async () => {
    db.client.push(lockAcquired, (sql) =>
      sql.includes('FROM pg_index') ? { rows: [{ indisvalid: false }], rowCount: 1 } : undefined
    )
    await queue.initialize(agent)

    const indexQueries = () => db.clientQueries.map((q) => q.sql).filter((sql) => sql.includes('INDEX CONCURRENTLY'))
    await vi.waitFor(() => expect(indexQueries()).toHaveLength(2))
    expect(indexQueries()[0]).toMatch(/^DROP INDEX CONCURRENTLY queued_message_sending_since_idx/)
    expect(indexQueries()[1]).toMatch(/^CREATE INDEX CONCURRENTLY queued_message_sending_since_idx/)
  })

  test('the reaper emits a pending event for each connection whose stale live session it removed', async () => {
    db.client.push(lockAcquired, (sql) =>
      sql.includes('DELETE FROM live_session')
        ? {
            rows: [
              { connection_id: connectionId, session_id: 's1', instance: 'dead-1' },
              { connection_id: connectionId, session_id: 's2', instance: 'dead-2' },
            ],
            rowCount: 2,
          }
        : undefined
    )
    await queue.initialize(agent)

    expect(pendingEvents()).toEqual([{ connectionId }])
  })

  test('a live session ending on this instance emits a pending event only when messages were reverted', async () => {
    let reverted = 2
    db.pool.push(
      (sql) =>
        sql.includes('DELETE FROM live_session') ? { rows: [{ session_id: session.id }], rowCount: 1 } : undefined,
      (sql) => (sql.includes('UPDATE queued_message qm') ? { rows: [], rowCount: reverted } : undefined)
    )
    await queue.initialize(agent)
    const onRemoved = agentHandlers.get(DidCommMessagePickupEventTypes.LiveSessionRemoved)

    await onRemoved?.({ payload: { session } })
    expect(pendingEvents()).toEqual([{ connectionId }])

    reverted = 0
    await onRemoved?.({ payload: { session } })
    expect(pendingEvents()).toEqual([{ connectionId }])
  })
})
