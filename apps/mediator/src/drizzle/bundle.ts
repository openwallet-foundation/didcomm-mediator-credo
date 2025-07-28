import { DrizzleRecordBundle } from '@credo-ts/drizzle-storage'

import { pushNotificationsFcmDrizzleRecord } from './pushNotificationsFcm'

export default {
  name: 'didcomm-mediator-credo',
  records: [pushNotificationsFcmDrizzleRecord],
  migrations: {
    postgres: {
      schemaSourcePath: `${__dirname}/../../src/drizzle/postgres.ts`,
      migrationsPath: `${__dirname}/../../migrations/postgres`,
    },
    sqlite: {
      schemaSourcePath: `${__dirname}/../../src/drizzle/sqlite.ts`,
      migrationsPath: `${__dirname}/../../migrations/sqlite`,
    },
  },
} as const satisfies DrizzleRecordBundle
