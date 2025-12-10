import { DrizzleRecordBundle } from '@credo-ts/drizzle-storage'

import { pushNotificationsFcmDrizzleRecord } from './pushNotificationsFcm/index.js'

export const mediatorBundle = {
  name: 'didcomm-mediator-credo',
  records: [pushNotificationsFcmDrizzleRecord],
  migrations: {
    postgres: {
      schemaPath: `${import.meta.dirname}/../../build/drizzle/postgres.js`,
      migrationsPath: `${import.meta.dirname}/../../migrations/postgres`,
    },
    sqlite: {
      schemaPath: `${import.meta.dirname}/../../build/drizzle/sqlite.js`,
      migrationsPath: `${import.meta.dirname}/../../migrations/sqlite`,
    },
  },
} as const satisfies DrizzleRecordBundle
