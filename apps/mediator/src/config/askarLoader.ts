import { AskarModule } from '@credo-ts/askar'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { config, logger } from '../config'

export async function loadAskar({
  enableStorage,
}: {
  /**
   * Override whether storage is enabled. Generally this should not be used, except for the migration of
   * askar to drizzle.
   */
  enableStorage?: boolean
} = {}): Promise<{ askar?: AskarModule }> {
  const { storage, kms } = config

  if (storage.type !== 'askar' && kms.type !== 'askar') {
    return {}
  }

  logger.info(
    `Using askar for ${kms.type === 'askar' && storage.type === 'askar' ? 'kms and storage' : kms.type === 'askar' ? 'kms' : 'storage'} with ${config.askar.database.type} database.`
  )

  return {
    askar: new AskarModule({
      askar: askar,
      store: {
        id: config.askar.storeId,
        key: config.askar.storeKey,
        keyDerivationMethod: config.askar.keyDerivationMethod,
        database:
          config.askar.database.type === 'postgres'
            ? {
                type: 'postgres',
                config: {
                  host: config.askar.database.host,
                },
                credentials: {
                  account: config.askar.database.user,
                  password: config.askar.database.password,
                  adminAccount: config.askar.database.adminUser,
                  adminPassword: config.askar.database.adminPassword,
                },
              }
            : { type: 'sqlite' },
      },
      enableKms: kms.type === 'askar',
      enableStorage: enableStorage ?? storage.type === 'askar',
    }),
  }
}
