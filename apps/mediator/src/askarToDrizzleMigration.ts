import { AskarToDrizzleStorageMigrator } from '@credo-ts/askar-to-drizzle-storage-migration'
import { agentDependencies } from '@credo-ts/node'
import { loadAskar } from './config/askarLoader.js'
import { loadStorage } from './config/storageLoader.js'
import { logger } from './config.js'

export async function askarToDrizzleMigration() {
  const { askar: askarModule } = await loadAskar({ enableStorage: true })
  if (!askarModule) throw new Error('Expected Askar to be configured')

  const { drizzle: drizzleModule } = loadStorage()
  if (!drizzleModule) throw new Error('Expected Drizzle to be configured')

  const migrator = await AskarToDrizzleStorageMigrator.initialize({
    drizzleModule,
    agentDependencies,
    logger,
    askarModule,
  })

  await migrator.migrate()
}

askarToDrizzleMigration().then(() => {
  logger.info('Migration complete')
  process.exit()
})
