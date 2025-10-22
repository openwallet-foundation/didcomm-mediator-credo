import type { TagsBase } from '@credo-ts/core'

import { BaseRecord, utils } from '@credo-ts/core'

export type DefaultPushNotificationsFcmTags = {
  connectionId: string
}

export type CustomPushNotificationsFcmTags = TagsBase

export interface PushNotificationsFcmStorageProps {
  id?: string
  deviceToken: string | null
  devicePlatform: string | null
  connectionId: string
  tags?: CustomPushNotificationsFcmTags
  projectId?: string
}

export class PushNotificationsFcmRecord extends BaseRecord<
  DefaultPushNotificationsFcmTags,
  CustomPushNotificationsFcmTags
> {
  public deviceToken!: string | null
  public devicePlatform!: string | null
  public connectionId!: string
  public projectId?: string
  public static readonly type = 'PushNotificationsFcmRecord'
  public readonly type = PushNotificationsFcmRecord.type

  public constructor(props: PushNotificationsFcmStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.devicePlatform = props.devicePlatform
      this.deviceToken = props.deviceToken
      this.connectionId = props.connectionId
      this.projectId = props.projectId
      this._tags = props.tags ?? {}
    }
  }

  public getTags() {
    return {
      ...this._tags,
      connectionId: this.connectionId,
    }
  }
}
