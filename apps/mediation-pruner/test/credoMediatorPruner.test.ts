import { describe, expect, it, vi } from 'vitest'

import {
  type AskarRecord,
  type AskarSession,
  type AskarStore,
  type AskarStoreFactory,
  CredoMediatorPruner,
  formatUtcDatetime,
  getConnectionActivityTime,
} from '../src/credoMediatorPruner.js'

class FakeSession implements AskarSession {
  public readonly removed: Array<[string, string]> = []
  public readonly replaced: Array<{
    category: string
    name: string
    valueJson: Record<string, unknown>
    tags?: Record<string, string> | null
  }> = []
  public readonly fetchCalls: Array<{
    category: string
    options?: { tagFilter?: Record<string, string>; limit?: number }
  }> = []

  public constructor(
    private readonly recordLookup: Record<string, AskarRecord[]> = {},
    private readonly connectionRecords: AskarRecord[] = []
  ) {}

  public async fetchAll(
    category: string,
    options?: { tagFilter?: Record<string, string>; limit?: number }
  ): Promise<AskarRecord[]> {
    this.fetchCalls.push({ category, options })

    if (category === 'ConnectionRecord' && !options?.tagFilter) {
      return this.connectionRecords
    }

    const key = JSON.stringify({ category, tagFilter: options?.tagFilter ?? {} })
    return this.recordLookup[key] ?? []
  }

  public async remove(category: string, name: string): Promise<void> {
    this.removed.push([category, name])
  }

  public async replace(options: {
    category: string
    name: string
    valueJson: Record<string, unknown>
    tags?: Record<string, string> | null
  }): Promise<void> {
    this.replaced.push(options)
  }
}

class FailingRemoveSession extends FakeSession {
  public constructor(private readonly failingRecordName: string) {
    super()
  }

  public override async remove(category: string, name: string): Promise<void> {
    if (category === 'ConnectionRecord' && name === this.failingRecordName) {
      throw new Error(`Cannot remove ${name}`)
    }

    await super.remove(category, name)
  }
}

class FakeStore implements AskarStore {
  public closed = false

  public constructor(private readonly sessions: AskarSession[]) {}

  public async fetchAll(
    category: string,
    options?: { tagFilter?: Record<string, string>; limit?: number }
  ): Promise<AskarRecord[]> {
    const session = this.sessions.shift()
    if (!session) {
      throw new Error('No session available')
    }

    return session.fetchAll(category, options)
  }

  public async withSession<T>(callback: (session: AskarSession) => Promise<T>): Promise<T> {
    const session = this.sessions.shift()
    if (!session) {
      throw new Error('No session available')
    }

    return callback(session)
  }

  public async close(): Promise<void> {
    this.closed = true
  }
}

class FakeStoreFactory implements AskarStoreFactory {
  public constructor(private readonly store: AskarStore) {}

  public async open(): Promise<AskarStore> {
    return this.store
  }
}

describe('getConnectionActivityTime', () => {
  it('prefers lastSeen from tags', () => {
    const activityTime = getConnectionActivityTime(
      {
        updatedAt: '2026-03-01T00:00:00Z',
        createdAt: '2026-02-01T00:00:00Z',
      },
      { lastSeen: '2026-03-24T20:27:09.902Z' }
    )

    expect(activityTime?.toISOString()).toBe('2026-03-24T20:27:09.902Z')
  })

  it('accepts non-utc offsets', () => {
    const activityTime = getConnectionActivityTime(
      {
        updatedAt: '2026-03-01T00:00:00Z',
        createdAt: '2026-02-01T00:00:00Z',
      },
      { lastSeen: '2026-03-24T22:27:09.902+02:00' }
    )

    expect(activityTime?.toISOString()).toBe('2026-03-24T20:27:09.902Z')
  })

  it('falls back to updatedAt', () => {
    const activityTime = getConnectionActivityTime({
      updatedAt: '2026-03-01T00:00:00Z',
      createdAt: '2026-02-01T00:00:00Z',
    })

    expect(activityTime?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('falls back to createdAt', () => {
    const activityTime = getConnectionActivityTime({ createdAt: '2026-02-01T00:00:00' })

    expect(activityTime?.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  it('falls back to valueJson tags', () => {
    const activityTime = getConnectionActivityTime({
      _tags: { lastSeen: '2026-03-24T20:27:09.902Z' },
      updatedAt: '2026-03-01T00:00:00Z',
    })

    expect(activityTime?.toISOString()).toBe('2026-03-24T20:27:09.902Z')
  })

  it('returns null without timestamps', () => {
    expect(getConnectionActivityTime({})).toBeNull()
  })
})

describe('CredoMediatorPruner', () => {
  it('deletes stale connections and related records', async () => {
    const connectionRecord: AskarRecord = {
      name: 'conn-1',
      valueJson: {
        theirDid: 'their-did',
        did: 'my-did',
        updatedAt: '2000-01-01T00:00:00Z',
      },
      tags: {},
    }
    const cleanupSession = new FakeSession(
      {
        [lookupKey('DidRecord', { did: 'their-did' })]: [{ name: 'did-2', valueJson: {} }],
        [lookupKey('DidRecord', { did: 'my-did' })]: [{ name: 'did-1', valueJson: {} }],
        [lookupKey('MediationRecord', { connectionId: 'conn-1' })]: [{ name: 'mediation-1', valueJson: {} }],
        [lookupKey('PushNotificationsFcmRecord', { connectionId: 'conn-1' })]: [{ name: 'firebase-1', valueJson: {} }],
      },
      []
    )
    const connectionLookupSession = new FakeSession({}, [connectionRecord])
    const store = new FakeStore([connectionLookupSession, cleanupSession])
    const connect = vi.fn(async () => undefined)
    const end = vi.fn(async () => undefined)
    const query = vi.fn(async () => ({ rows: [] }))
    const walletConnect = vi.fn(async () => undefined)
    const walletClose = vi.fn(async () => undefined)

    const pruner = new CredoMediatorPruner({
      conn: { uri: 'sqlite:///wallet.db', connect: walletConnect, close: walletClose },
      pickupRepoConn: { connectionString: 'postgres://user:pass@localhost:5432/db' },
      walletKey: 'key',
      inactiveDaysThreshold: 365,
      storeFactory: new FakeStoreFactory(store),
      pgClientFactory: () => ({ connect, query, end }),
      logger: { log: vi.fn(), error: vi.fn() },
    })

    await pruner.prune()

    expect(cleanupSession.removed).toEqual([
      ['ConnectionRecord', 'conn-1'],
      ['DidRecord', 'did-2'],
      ['DidRecord', 'did-1'],
      ['MediationRecord', 'mediation-1'],
      ['PushNotificationsFcmRecord', 'firebase-1'],
    ])
    expect(store.closed).toBe(true)
    expect(walletClose).toHaveBeenCalledOnce()
    expect(end).toHaveBeenCalledOnce()
  })

  it('does not prune stale connections that still have queued messages in the pickup repository', async () => {
    const connectionRecord: AskarRecord = {
      name: 'conn-queued',
      valueJson: { updatedAt: '2000-01-01T00:00:00Z' },
      tags: {},
    }
    const cleanupSession = new FakeSession()
    const connectionLookupSession = new FakeSession({}, [connectionRecord])
    const store = new FakeStore([connectionLookupSession, cleanupSession])
    const query = vi.fn(async () => ({ rows: [{ connection_id: 'conn-queued' }] }))
    const walletClose = vi.fn(async () => undefined)

    const pruner = new CredoMediatorPruner({
      conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: walletClose },
      pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
      walletKey: 'key',
      storeFactory: new FakeStoreFactory(store),
      pgClientFactory: () => ({ connect: vi.fn(async () => undefined), query, end: vi.fn(async () => undefined) }),
      logger: { log: vi.fn(), error: vi.fn() },
    })

    await pruner.prune()

    expect(cleanupSession.removed).toEqual([])
    expect(cleanupSession.replaced).toEqual([])
    expect(cleanupSession.fetchCalls).toEqual([])
    expect(store.closed).toBe(true)
    expect(walletClose).toHaveBeenCalledOnce()
  })

  it('backfills updatedAt when timestamps are missing', async () => {
    const connectionRecord: AskarRecord = { name: 'conn-1', valueJson: {}, tags: {} }
    const cleanupSession = new FakeSession()
    const connectionLookupSession = new FakeSession({}, [connectionRecord])
    const store = new FakeStore([connectionLookupSession, cleanupSession])
    const now = new Date('2026-04-06T12:00:00Z')
    const walletClose = vi.fn(async () => undefined)

    vi.useFakeTimers()
    vi.setSystemTime(now)

    try {
      const pruner = new CredoMediatorPruner({
        conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: walletClose },
        pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
        walletKey: 'key',
        storeFactory: new FakeStoreFactory(store),
        pgClientFactory: () => ({
          connect: vi.fn(async () => undefined),
          query: vi.fn(async () => ({ rows: [] })),
          end: vi.fn(async () => undefined),
        }),
        logger: { log: vi.fn(), error: vi.fn() },
      })

      await pruner.prune()

      expect(cleanupSession.removed).toEqual([])
      expect(cleanupSession.replaced).toEqual([
        {
          category: 'ConnectionRecord',
          name: 'conn-1',
          valueJson: { updatedAt: formatUtcDatetime(now) },
          tags: {},
        },
      ])
      expect(store.closed).toBe(true)
      expect(walletClose).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not prune connections that are not yet inactive', async () => {
    const now = new Date('2026-04-08T12:00:00Z')
    const connectionRecord: AskarRecord = {
      name: 'conn-active',
      valueJson: { updatedAt: '2026-04-01T00:00:00Z' },
      tags: {},
    }
    const activeSession = new FakeSession()
    const connectionLookupSession = new FakeSession({}, [connectionRecord])
    const store = new FakeStore([connectionLookupSession, activeSession])
    const walletClose = vi.fn(async () => undefined)

    vi.useFakeTimers()
    vi.setSystemTime(now)

    try {
      const pruner = new CredoMediatorPruner({
        conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: walletClose },
        pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
        walletKey: 'key',
        inactiveDaysThreshold: 30,
        storeFactory: new FakeStoreFactory(store),
        pgClientFactory: () => ({
          connect: vi.fn(async () => undefined),
          query: vi.fn(async () => ({ rows: [] })),
          end: vi.fn(async () => undefined),
        }),
        logger: { log: vi.fn(), error: vi.fn() },
      })

      await pruner.prune()

      expect(activeSession.removed).toEqual([])
      expect(activeSession.replaced).toEqual([])
      expect(activeSession.fetchCalls).toEqual([])
      expect(store.closed).toBe(true)
      expect(walletClose).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses lastSeen tags to keep a connection when updatedAt is stale', async () => {
    const now = new Date('2026-04-08T12:00:00Z')
    const connectionRecord: AskarRecord = {
      name: 'conn-last-seen',
      valueJson: { updatedAt: '2000-01-01T00:00:00Z' },
      tags: { lastSeen: '2026-04-07T00:00:00Z' },
    }
    const activeSession = new FakeSession()
    const connectionLookupSession = new FakeSession({}, [connectionRecord])
    const store = new FakeStore([connectionLookupSession, activeSession])

    vi.useFakeTimers()
    vi.setSystemTime(now)

    try {
      const pruner = new CredoMediatorPruner({
        conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
        pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
        walletKey: 'key',
        inactiveDaysThreshold: 30,
        storeFactory: new FakeStoreFactory(store),
        pgClientFactory: () => ({
          connect: vi.fn(async () => undefined),
          query: vi.fn(async () => ({ rows: [] })),
          end: vi.fn(async () => undefined),
        }),
        logger: { log: vi.fn(), error: vi.fn() },
      })

      await pruner.prune()

      expect(activeSession.removed).toEqual([])
      expect(activeSession.replaced).toEqual([])
      expect(activeSession.fetchCalls).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes the connection even when related records are absent', async () => {
    const connectionRecord: AskarRecord = {
      name: 'conn-no-related',
      valueJson: {
        theirDid: 'their-did',
        did: 'my-did',
        updatedAt: '2000-01-01T00:00:00Z',
      },
      tags: {},
    }
    const cleanupSession = new FakeSession({}, [])
    const connectionLookupSession = new FakeSession({}, [connectionRecord])
    const store = new FakeStore([connectionLookupSession, cleanupSession])

    const pruner = new CredoMediatorPruner({
      conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
      pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
      walletKey: 'key',
      inactiveDaysThreshold: 30,
      storeFactory: new FakeStoreFactory(store),
      pgClientFactory: () => ({
        connect: vi.fn(async () => undefined),
        query: vi.fn(async () => ({ rows: [] })),
        end: vi.fn(async () => undefined),
      }),
      logger: { log: vi.fn(), error: vi.fn() },
    })

    await pruner.prune()

    expect(cleanupSession.removed).toEqual([['ConnectionRecord', 'conn-no-related']])
    expect(cleanupSession.fetchCalls).toEqual([
      { category: 'DidRecord', options: { tagFilter: { did: 'their-did' }, limit: 1 } },
      { category: 'DidRecord', options: { tagFilter: { did: 'my-did' }, limit: 1 } },
      { category: 'MediationRecord', options: { tagFilter: { connectionId: 'conn-no-related' }, limit: 1 } },
      { category: 'PushNotificationsFcmRecord', options: { tagFilter: { connectionId: 'conn-no-related' }, limit: 1 } },
    ])
  })

  it('logs a per-connection error and continues processing later records', async () => {
    const connectionRecords: AskarRecord[] = [
      {
        name: 'conn-fail',
        valueJson: { updatedAt: '2000-01-01T00:00:00Z' },
        tags: {},
      },
      {
        name: 'conn-ok',
        valueJson: { updatedAt: '2000-01-01T00:00:00Z', theirDid: 'their-did' },
        tags: {},
      },
    ]
    const failingSession = new FailingRemoveSession('conn-fail')
    const successSession = new FakeSession({
      [lookupKey('DidRecord', { did: 'their-did' })]: [{ name: 'did-2', valueJson: {} }],
    })
    const connectionLookupSession = new FakeSession({}, connectionRecords)
    const store = new FakeStore([connectionLookupSession, failingSession, successSession])
    const logger = { log: vi.fn(), error: vi.fn() }

    const pruner = new CredoMediatorPruner({
      conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
      pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
      walletKey: 'key',
      inactiveDaysThreshold: 30,
      storeFactory: new FakeStoreFactory(store),
      pgClientFactory: () => ({
        connect: vi.fn(async () => undefined),
        query: vi.fn(async () => ({ rows: [] })),
        end: vi.fn(async () => undefined),
      }),
      logger,
    })

    await pruner.prune()

    expect(logger.error).toHaveBeenCalledWith(
      'Error processing connection record with id conn-fail: Cannot remove conn-fail'
    )
    expect(successSession.removed).toEqual([
      ['ConnectionRecord', 'conn-ok'],
      ['DidRecord', 'did-2'],
    ])
    expect(logger.log).toHaveBeenCalledWith(
      'Deleted connection record with id conn-ok last active at 2000-01-01T00:00:00.000Z and associated records'
    )
  })

  it('logs an invalid timestamp error and continues processing later records', async () => {
    const connectionRecords: AskarRecord[] = [
      {
        name: 'conn-invalid-time',
        valueJson: { updatedAt: 'not-a-date' },
        tags: {},
      },
      {
        name: 'conn-ok',
        valueJson: { updatedAt: '2000-01-01T00:00:00Z' },
        tags: {},
      },
    ]
    const invalidTimestampSession = new FakeSession()
    const successSession = new FakeSession()
    const connectionLookupSession = new FakeSession({}, connectionRecords)
    const store = new FakeStore([connectionLookupSession, invalidTimestampSession, successSession])
    const logger = { log: vi.fn(), error: vi.fn() }

    const pruner = new CredoMediatorPruner({
      conn: { uri: 'sqlite:///wallet.db', connect: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
      pickupRepoConn: { connectionString: 'postgres://localhost:5432/db' },
      walletKey: 'key',
      inactiveDaysThreshold: 30,
      storeFactory: new FakeStoreFactory(store),
      pgClientFactory: () => ({
        connect: vi.fn(async () => undefined),
        query: vi.fn(async () => ({ rows: [] })),
        end: vi.fn(async () => undefined),
      }),
      logger,
    })

    await pruner.prune()

    expect(logger.error).toHaveBeenCalledWith(
      'Error processing connection record with id conn-invalid-time: Invalid ISO datetime: not-a-date'
    )
    expect(invalidTimestampSession.removed).toEqual([])
    expect(successSession.removed).toEqual([['ConnectionRecord', 'conn-ok']])
    expect(logger.log).toHaveBeenCalledWith(
      'Deleted connection record with id conn-ok last active at 2000-01-01T00:00:00.000Z and associated records'
    )
  })
})

function lookupKey(category: string, tagFilter: Record<string, string>): string {
  return JSON.stringify({ category, tagFilter })
}
