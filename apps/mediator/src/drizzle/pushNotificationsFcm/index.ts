import { DrizzleRecord } from '@credo-ts/drizzle-storage'
import { DrizzlePushNotificationsFcmRecordAdapter } from './DrizzlePushNotificationsFcmRecordAdapter.js'
import * as postgres from './postgres.js'
import * as sqlite from './sqlite.js'

export const pushNotificationsFcmDrizzleRecord = {
  adapter: DrizzlePushNotificationsFcmRecordAdapter,
  postgres,
  sqlite,
} satisfies DrizzleRecord
