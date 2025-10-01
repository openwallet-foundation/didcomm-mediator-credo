import type { FcmDeviceInfo } from '../models'

import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsString, ValidateIf } from 'class-validator'

interface PushNotificationsFcmDeviceInfoOptions extends FcmDeviceInfo {
  id?: string
  threadId: string
}

/**
 * Message to send the fcm device information from another agent for push notifications
 * This is used as a response for the `get-device-info` message
 *
 * @see https://github.com/hyperledger/aries-rfcs/tree/main/features/0734-push-notifications-fcm#device-info
 */
export class PushNotificationsFcmDeviceInfoMessage extends DidCommMessage {
  public constructor(options: PushNotificationsFcmDeviceInfoOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId })
      this.deviceToken = options.deviceToken
      this.devicePlatform = options.devicePlatform
    }
  }

  @Expose({ name: 'device_token' })
  @IsString()
  @ValidateIf((_, value) => value !== null)
  public deviceToken!: string | null

  @Expose({ name: 'device_platform' })
  @IsString()
  @ValidateIf((_, value) => value !== null)
  public devicePlatform!: string | null

  public static readonly type = parseMessageType('https://didcomm.org/push-notifications-fcm/1.0/device-info')

  @IsValidMessageType(PushNotificationsFcmDeviceInfoMessage.type)
  public readonly type = PushNotificationsFcmDeviceInfoMessage.type.messageTypeUri
}
