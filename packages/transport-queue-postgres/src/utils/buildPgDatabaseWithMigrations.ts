import fs from 'node:fs'
import path from 'node:path'
import { Logger } from '@credo-ts/core'
import { Client, Pool } from 'pg'

/**
 * Runs all pending SQL migrations in a target PostgreSQL database.
 * - Automatically creates the database if it does not exist.
 * - Applies versioned `.sql` files from a directory.
 *
 * @param logger - Optional Credo-compatible logger instance
 * @param postgresConfig - Connection config to connect as superuser (to create DB if needed).
 * @param targetDatabase - Name of the target database to migrate.
 * @param migrationsDir - Directory where migration `.sql` files are located.
 */
export async function buildPgDatabaseWithMigrations(
  logger: Logger | undefined,
  postgresConfig: { user: string; password: string; host: string; port?: number },
  targetDatabase: string,
  migrationsDir: string = path.resolve(__dirname, '../migrations')
): Promise<void> {
  const adminClient = new Client(postgresConfig)

  try {
    await adminClient.connect()

    // Try to create the target database if it doesn't exist
    const existsResult = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabase])

    if (existsResult.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${targetDatabase}`)
      logger?.info(`[migration] Database "${targetDatabase}" created.`)
    } else {
      logger?.info(`[migration] Database "${targetDatabase}" already exists.`)
    }

    await adminClient.end()
  } catch (error) {
    logger?.error(`[migration] Failed to create database "${targetDatabase}": ${(error as Error).message}`)
    await adminClient.end()
    throw error
  }

  // Now connect to the target database using a pool
  const pool = new Pool({ ...postgresConfig, database: targetDatabase })

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TIMESTAMP DEFAULT now()
      )
    `)

    const result = await client.query('SELECT version FROM schema_version ORDER BY id DESC LIMIT 1')
    const currentVersion = result.rows.length > 0 ? result.rows[0].version : 0
    logger?.info(`[migration] Current schema version: ${currentVersion}`)

    if (!fs.existsSync(migrationsDir)) {
      logger?.warn(`[migration] Migrations directory not found: ${migrationsDir}. Skipping.`)
      await client.query('COMMIT')
      return
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d{3,}-[\w\-]+\.sql$/.test(file))
      .sort()

    for (const file of files) {
      const versionMatch = file.match(/^(\d{3,})-/)
      if (!versionMatch) {
        logger?.warn(`[migration] Skipping invalid filename: ${file}`)
        continue
      }

      const version = Number.parseInt(versionMatch[1], 10)
      if (version <= currentVersion) {
        logger?.debug(`[migration] Skipping already applied: ${file}`)
        continue
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      logger?.info(`[migration] Applying migration: ${file}`)

      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_version (version) VALUES ($1)', [version])
        logger?.info(`[migration] Applied successfully: ${file}`)
      } catch (fileErr) {
        throw new Error(`[migration] Failed to apply ${file}: ${(fileErr as Error).message}`)
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    logger?.error(`[migration] Migration process failed: ${(err as Error).message}`)
    await client.query('ROLLBACK')
  } finally {
    client.release()
    await pool.end()
  }
}
