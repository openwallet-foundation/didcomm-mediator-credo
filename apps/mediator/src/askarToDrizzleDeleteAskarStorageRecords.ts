import { AskarToDrizzleStorageMigrator } from '@credo-ts/askar-to-drizzle-storage-migration'
import { agentDependencies } from '@credo-ts/node'
import { logger } from './config'
import { loadAskar } from './config/askarLoader'
import { loadStorage } from './config/storageLoader'

export async function askarToDrizzleDeleteAskarStorageRecords() {
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

  await migrator.deleteStorageRecords()
}

askarToDrizzleDeleteAskarStorageRecords().then(() => {
  logger.info('Deletion complete')
  process.exit()
})
