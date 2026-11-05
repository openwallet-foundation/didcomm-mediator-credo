import { randomUUID } from 'node:crypto'
import { Agent, AgentContext, ConsoleLogger, LogLevel } from '@credo-ts/core'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { DidCommTransportQueuePostgres } from '../src/index.js'
import { dropDatabase, postgresConfig, uniqueDatabaseName, withClient } from './postgres.js'

vi.mock('pg-pubsub', () => ({
  default: class {
    public async addChannel() {}
    public async publish() {}
  },
}))

const database = uniqueDatabaseName('tq_take_from_queue')
const connectionId = randomUUID()
const recipientDid = 'did:peer:2.recipient'

const logger = new ConsoleLogger(LogLevel.Off)
const agentContext = { config: { logger }, resolve: () => ({ emit: () => {} }) } as unknown as AgentContext
const agent = { context: agentContext, events: { on: () => {} } } as unknown as Agent

async function enqueue(count: number, options: { connectionId?: string; recipientDids?: string[] } = {}) {
  const result = await withClient(database, (client) =>
    client.query<{ id: string }>(
      `INSERT INTO queued_message (connection_id, recipient_dids, encrypted_message, state, created_at)
       SELECT $1, $2, '{}'::jsonb, 'pending', now() + n * interval '1 millisecond'
       FROM generate_series(1, $3) AS n
       RETURNING id`,
      [options.connectionId ?? connectionId, options.recipientDids ?? [], count]
    )
  )
  return result.rows.map((row) => row.id)
}

async function remainingIds() {
  const result = await withClient(database, (client) => client.query<{ id: string }>('SELECT id FROM queued_message'))
  return result.rows.map((row) => row.id)
}

describe('DidCommTransportQueuePostgres.takeFromQueue against Postgres', () => {
  let queue: DidCommTransportQueuePostgres

  beforeAll(async () => {
    queue = new DidCommTransportQueuePostgres({
      logger,
      postgresUser: postgresConfig.user,
      postgresPassword: postgresConfig.password,
      postgresHost: postgresConfig.host,
      postgresDatabaseName: database,
    })
    await queue.initialize(agent)
  }, 30_000)

  afterAll(async () => {
    await queue.shutdown(agentContext)
    await dropDatabase(database)
  }, 30_000)

  beforeEach(async () => {
    await withClient(database, (client) => client.query('DELETE FROM queued_message'))
  })

  test('deleteMessages removes and returns the pending messages for the connection or recipient DID', async () => {
    const forConnection = await enqueue(2)
    const forRecipientDid = await enqueue(1, { connectionId: randomUUID(), recipientDids: [recipientDid] })
    const unrelated = await enqueue(1, { connectionId: randomUUID(), recipientDids: ['did:peer:2.other'] })

    const taken = await queue.takeFromQueue(agentContext, { connectionId, recipientDid, deleteMessages: true })

    expect(taken.map((message) => message.id).sort()).toEqual([...forConnection, ...forRecipientDid].sort())
    expect(await remainingIds()).toEqual(unrelated)
  })

  test('without a limit every pending message is taken', async () => {
    const ids = await enqueue(15)

    const taken = await queue.takeFromQueue(agentContext, { connectionId })

    expect(taken.map((message) => message.id).sort()).toEqual(ids.sort())
  })

  test('the limit takes the oldest messages first', async () => {
    const ids = await enqueue(5)

    const taken = await queue.takeFromQueue(agentContext, { connectionId, limit: 2, deleteMessages: true })

    expect(taken.map((message) => message.id).sort()).toEqual(ids.slice(0, 2).sort())
  })

  test('concurrent takes never return the same message twice', async () => {
    const ids = await enqueue(20)

    const takes = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        queue.takeFromQueue(agentContext, { connectionId, limit: 10, deleteMessages: index % 2 === 0 })
      )
    )
    const taken = takes.flat().map((message) => message.id)

    expect(new Set(taken).size).toBe(taken.length)
    expect(taken.sort()).toEqual(ids.sort())
  })

  test('the recipient DID index is built', async () => {
    await vi.waitFor(
      async () => {
        const index = await withClient(database, (client) =>
          client.query<{ indisvalid: boolean; predicate: string }>(
            `SELECT indisvalid, pg_get_expr(indpred, indrelid) AS predicate
             FROM pg_index WHERE indexrelid = to_regclass('queued_message_pending_recipient_dids_gin_idx')`
          )
        )
        expect(index.rows[0]?.indisvalid).toBe(true)
        expect(index.rows[0]?.predicate).toBe("(state = 'pending'::message_state)")
      },
      { timeout: 10_000 }
    )
  })

  test('startup replaces a legacy full index without rebuilding a valid partial index', async () => {
    await withClient(database, (client) =>
      client.query('CREATE INDEX queued_message_recipient_dids_gin_idx ON queued_message USING GIN (recipient_dids)')
    )
    const indexOid = async () =>
      withClient(database, async (client) => {
        const result = await client.query<{ oid: number }>(
          "SELECT oid FROM pg_class WHERE relname = 'queued_message_pending_recipient_dids_gin_idx'"
        )
        return result.rows[0]?.oid
      })
    await queue.shutdown(agentContext)
    await withClient(database, (client) => client.query('DROP INDEX queued_message_pending_recipient_dids_gin_idx'))
    await queue.initialize(agent)

    await vi.waitFor(
      async () => {
        const oldIndex = await withClient(database, (client) =>
          client.query("SELECT to_regclass('queued_message_recipient_dids_gin_idx') AS name")
        )
        expect(oldIndex.rows[0].name).toBeNull()
      },
      { timeout: 10_000 }
    )
    const replacementOid = await indexOid()
    expect(replacementOid).toBeDefined()
    await queue.shutdown(agentContext)
    await withClient(database, (client) =>
      client.query('CREATE INDEX queued_message_recipient_dids_gin_idx ON queued_message USING GIN (recipient_dids)')
    )
    await queue.initialize(agent)
    await vi.waitFor(async () => {
      const oldIndex = await withClient(database, (client) =>
        client.query("SELECT to_regclass('queued_message_recipient_dids_gin_idx') AS name")
      )
      expect(oldIndex.rows[0].name).toBeNull()
    })
    expect(await indexOid()).toBe(replacementOid)
  })
})
