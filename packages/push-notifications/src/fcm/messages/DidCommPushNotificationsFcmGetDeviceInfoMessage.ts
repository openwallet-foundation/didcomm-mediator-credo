import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'

interface PushNotificationsFcmGetDeviceInfoOptions {
  id?: string
}

/**
 * Message to get fcm  the device information from another agent for push notifications
 *
 * @see https://github.com/hyperledger/aries-rfcs/tree/main/features/0734-push-notifications-fcm#get-device-info
 */
export class DidCommPushNotificationsFcmGetDeviceInfoMessage extends DidCommMessage {
  public constructor(options: PushNotificationsFcmGetDeviceInfoOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
    }
  }
  public static readonly type = parseMessageType('https://didcomm.org/push-notifications-fcm/1.0/get-device-info')

  @IsValidMessageType(DidCommPushNotificationsFcmGetDeviceInfoMessage.type)
  public readonly type = DidCommPushNotificationsFcmGetDeviceInfoMessage.type.messageTypeUri
}
