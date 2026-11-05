import fs from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { buildPgDatabaseWithMigrations } from '../src/utils/buildPgDatabaseWithMigrations.js'

const mocks = vi.hoisted(() => {
  const adminClient = {
    connect: vi.fn(),
    query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    end: vi.fn(),
  }
  const migrationClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  }
  const pool = {
    connect: vi.fn().mockResolvedValue(migrationClient),
    end: vi.fn(),
  }
  return {
    adminClient,
    migrationClient,
    pool,
    // biome-ignore lint/complexity/useArrowFunction: pg clients are instantiated with new.
    Client: vi.fn(function () {
      return adminClient
    }),
    // biome-ignore lint/complexity/useArrowFunction: pg pools are instantiated with new.
    Pool: vi.fn(function () {
      return pool
    }),
  }
})

vi.mock('pg', () => ({ Client: mocks.Client, Pool: mocks.Pool }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('uses postgres for maintenance and the configured target for migrations, not the username or PGDATABASE', async () => {
  vi.stubEnv('PGDATABASE', 'unexpected_database')
  vi.spyOn(fs, 'existsSync').mockReturnValue(false)
  const config = { user: 'mediator_user', password: 'test-password', host: 'localhost', port: 5432 }
  const targetDatabase = 'messagepickuprepository'

  await buildPgDatabaseWithMigrations(undefined, config, targetDatabase)

  expect(mocks.Client).toHaveBeenCalledExactlyOnceWith({ ...config, database: 'postgres' })
  expect(mocks.adminClient.query).toHaveBeenCalledWith('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabase])
  expect(mocks.Pool).toHaveBeenCalledExactlyOnceWith({ ...config, database: targetDatabase })
  expect(mocks.migrationClient.query).toHaveBeenCalledWith('BEGIN')
  expect(mocks.migrationClient.query).toHaveBeenCalledWith('COMMIT')
  expect(mocks.adminClient.end).toHaveBeenCalledOnce()
  expect(mocks.migrationClient.release).toHaveBeenCalledOnce()
  expect(mocks.pool.end).toHaveBeenCalledOnce()
})
