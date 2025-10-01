import { JsonTransformer, TagsBase } from '@credo-ts/core'

import { BaseDrizzleRecordAdapter, DrizzleAdapterRecordValues, DrizzleDatabase } from '@credo-ts/drizzle-storage'
import { PushNotificationsFcmRecord } from '../../push-notifications/fcm/repository'
import * as postgres from './postgres'
import * as sqlite from './sqlite'

type DrizzlePushNotificationsFcmAdapterValues = DrizzleAdapterRecordValues<(typeof sqlite)['pushNotificationsFcm']>
export class DrizzlePushNotificationsFcmRecordAdapter extends BaseDrizzleRecordAdapter<
  PushNotificationsFcmRecord,
  typeof postgres.pushNotificationsFcm,
  typeof postgres,
  typeof sqlite.pushNotificationsFcm,
  typeof sqlite
> {
  public constructor(database: DrizzleDatabase<typeof postgres, typeof sqlite>) {
    super(
      database,
      { postgres: postgres.pushNotificationsFcm, sqlite: sqlite.pushNotificationsFcm },
      PushNotificationsFcmRecord
    )
  }

  public getValues(record: PushNotificationsFcmRecord) {
    const { connectionId, ...customTags } = record.getTags()

    return {
      connectionId,
      deviceToken: record.deviceToken,
      devicePlatform: record.devicePlatform,
      customTags,
    }
  }

  public toRecord(values: DrizzlePushNotificationsFcmAdapterValues): PushNotificationsFcmRecord {
    const { customTags, ...remainingValues } = values

    const record = JsonTransformer.fromJSON(remainingValues, PushNotificationsFcmRecord)
    if (customTags) record.setTags(customTags as TagsBase)

    return record
  }
}
