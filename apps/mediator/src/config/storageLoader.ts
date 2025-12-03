import { DrizzleStorageModule } from '@credo-ts/drizzle-storage'
import { didcommBundle } from '@credo-ts/drizzle-storage/didcomm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres'
import { config, logger } from '../config.js'
import { mediatorBundle } from '../drizzle/bundle.js'

export function loadStorage(): { drizzle?: DrizzleStorageModule } {
  const { storage } = config

  if (storage.type === 'drizzle') {
    logger.info('Using drizzle storage')

    const database =
      storage.dialect === 'postgres' ? drizzlePostgres(storage.databaseUrl) : drizzleSqlite(storage.databaseUrl)

    return {
      drizzle: new DrizzleStorageModule({
        database,
        bundles: [didcommBundle, mediatorBundle],
      }),
    }
  }

  return {}
}
