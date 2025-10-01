import type { DidCommEncryptedMessage } from '@credo-ts/didcomm'

import { BaseRecord, utils } from '@credo-ts/core'

export type DefaultMessageRecordTags = {
  connectionId: string
}

export interface MessageRecordStorageProps {
  id?: string
  createdAt?: Date
  connectionId: string
  message: DidCommEncryptedMessage
}

export class MessageRecord extends BaseRecord<DefaultMessageRecordTags> implements MessageRecordStorageProps {
  public sentTime!: string
  public connectionId!: string
  public message!: DidCommEncryptedMessage

  public static override readonly type = 'MessageRecord'
  public override readonly type = MessageRecord.type

  public constructor(props: MessageRecordStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.connectionId = props.connectionId
      this.message = props.message
    }
  }

  public getTags() {
    return {
      ...this._tags,
      connectionId: this.connectionId,
    }
  }
}
