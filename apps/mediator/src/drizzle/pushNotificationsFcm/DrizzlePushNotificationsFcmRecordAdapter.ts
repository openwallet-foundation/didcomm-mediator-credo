import { JsonTransformer, TagsBase } from '@credo-ts/core'
import { DidCommPushNotificationsFcmRecord } from '@credo-ts/didcomm-push-notifications'
import { BaseDrizzleRecordAdapter, DrizzleAdapterRecordValues, DrizzleDatabase } from '@credo-ts/drizzle-storage'
import * as postgres from './postgres.js'
import * as sqlite from './sqlite.js'

type DrizzlePushNotificationsFcmAdapterValues = DrizzleAdapterRecordValues<(typeof sqlite)['pushNotificationsFcm']>
export class DrizzlePushNotificationsFcmRecordAdapter extends BaseDrizzleRecordAdapter<
  DidCommPushNotificationsFcmRecord,
  typeof postgres.pushNotificationsFcm,
  typeof postgres,
  typeof sqlite.pushNotificationsFcm,
  typeof sqlite
> {
  public constructor(database: DrizzleDatabase<typeof postgres, typeof sqlite>) {
    super(
      database,
      { postgres: postgres.pushNotificationsFcm, sqlite: sqlite.pushNotificationsFcm },
      DidCommPushNotificationsFcmRecord
    )
  }

  public getValues(record: DidCommPushNotificationsFcmRecord) {
    const { connectionId, ...customTags } = record.getTags()

    return {
      connectionId,
      deviceToken: record.deviceToken,
      devicePlatform: record.devicePlatform,
      firebaseProjectId: record.firebaseProjectId,
      customTags,
    }
  }

  public toRecord(values: DrizzlePushNotificationsFcmAdapterValues): DidCommPushNotificationsFcmRecord {
    const { customTags, ...remainingValues } = values

    const record = JsonTransformer.fromJSON(remainingValues, DidCommPushNotificationsFcmRecord)
    if (customTags) record.setTags(customTags as TagsBase)

    return record
  }
}
