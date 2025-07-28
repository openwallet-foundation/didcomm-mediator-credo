import { DrizzleRecord } from '@credo-ts/drizzle-storage'
import { DrizzlePushNotificationsFcmRecordAdapter } from './DrizzlePushNotificationsFcmRecordAdapter'
import * as postgres from './postgres'
import * as sqlite from './sqlite'

export const pushNotificationsFcmDrizzleRecord = {
  adapter: DrizzlePushNotificationsFcmRecordAdapter,
  postgres,
  sqlite,
} satisfies DrizzleRecord
