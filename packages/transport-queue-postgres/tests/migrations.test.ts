import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { buildPgDatabaseWithMigrations } from '../src/utils/buildPgDatabaseWithMigrations.js'
import { dropDatabase, postgresConfig, uniqueDatabaseName, withClient } from './postgres.js'

const migrationsDir = path.resolve(import.meta.dirname, '../migrations')
const liveModePostgresMigrationsDir = path.resolve(import.meta.dirname, 'fixtures/live-mode-postgres')
const tables = ['queued_message', 'live_session', 'instance']
// Left behind by live-mode-postgres; harmless to this package.
const liveModePostgresOnlyColumns = ['live_session.expires_at']
const liveModePostgresOnlyIndexes = ['live_session_expires_at_idx', 'queued_message_recipient_dids_gin_idx']

const ourDatabase = uniqueDatabaseName('tq_migrations_ours')
const liveModePostgresDatabase = uniqueDatabaseName('tq_migrations_live_mode')

// Recreates a database last migrated by live-mode-postgres: the shared 001, its own 002-004, schema_version 4.
async function createLiveModePostgresDatabase() {
  await withClient(undefined, (client) => client.query(`CREATE DATABASE ${liveModePostgresDatabase}`))
  await withClient(liveModePostgresDatabase, async (client) => {
    await client.query(
      'CREATE TABLE schema_version (id SERIAL PRIMARY KEY, version INTEGER NOT NULL, updated_at TIMESTAMP DEFAULT now())'
    )
    const files = [
      path.join(migrationsDir, '001-initial-schema.sql'),
      ...fs
        .readdirSync(liveModePostgresMigrationsDir)
        .sort()
        .map((file) => path.join(liveModePostgresMigrationsDir, file)),
    ]
    for (const [index, file] of files.entries()) {
      await client.query(fs.readFileSync(file, 'utf-8'))
      await client.query('INSERT INTO schema_version (version) VALUES ($1)', [index + 1])
    }
    await client.query(
      `INSERT INTO queued_message (connection_id, recipient_dids, encrypted_message, state)
       VALUES (gen_random_uuid(), '{}', '{}', 'sending')`
    )
  })
}

async function describeSchema(database: string) {
  return withClient(database, async (client) => {
    const columns = await client.query(
      `SELECT table_name || '.' || column_name AS name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1)
       ORDER BY name`,
      [tables]
    )
    const indexes = await client.query(
      `SELECT indexname AS name, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = ANY($1)
       ORDER BY name`,
      [tables]
    )
    const version = await client.query('SELECT max(version) AS version FROM schema_version')
    return { columns: columns.rows, indexes: indexes.rows, version: version.rows[0].version }
  })
}

describe('migrations', () => {
  beforeAll(async () => {
    await createLiveModePostgresDatabase()
    await buildPgDatabaseWithMigrations(undefined, postgresConfig, ourDatabase)
    await buildPgDatabaseWithMigrations(undefined, postgresConfig, liveModePostgresDatabase)
  }, 30_000)

  afterAll(async () => {
    await dropDatabase(ourDatabase)
    await dropDatabase(liveModePostgresDatabase)
  }, 30_000)

  test('a database created by live-mode-postgres converges on our schema', async () => {
    const ours = await describeSchema(ourDatabase)
    const liveModePostgres = await describeSchema(liveModePostgresDatabase)

    expect(ours.version).toBe(liveModePostgres.version)
    expect(liveModePostgres.columns.filter((column) => !liveModePostgresOnlyColumns.includes(column.name))).toEqual(
      ours.columns
    )
    expect(liveModePostgres.indexes.filter((index) => !liveModePostgresOnlyIndexes.includes(index.name))).toEqual(
      ours.indexes
    )
  })

  test('messages a live-mode-postgres instance left in sending get an ack timeout', async () => {
    const stuck = await withClient(liveModePostgresDatabase, (client) =>
      client.query(`SELECT 1 FROM queued_message WHERE state = 'sending' AND sending_since IS NULL`)
    )
    expect(stuck.rowCount).toBe(0)
  })
})
