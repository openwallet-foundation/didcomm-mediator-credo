import { DrizzleRecordBundle } from '@credo-ts/drizzle-storage'

import { pushNotificationsFcmDrizzleRecord } from './pushNotificationsFcm'

export const mediatorBundle = {
  name: 'didcomm-mediator-credo',
  records: [pushNotificationsFcmDrizzleRecord],
  migrations: {
    postgres: {
      schemaPath: `${__dirname}/../../build/drizzle/postgres.js`,
      migrationsPath: `${__dirname}/../../migrations/postgres`,
    },
    sqlite: {
      schemaPath: `${__dirname}/../../build/drizzle/sqlite.js`,
      migrationsPath: `${__dirname}/../../migrations/sqlite`,
    },
  },
} as const satisfies DrizzleRecordBundle
