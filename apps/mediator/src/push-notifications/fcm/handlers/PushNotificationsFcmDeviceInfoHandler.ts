import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { PushNotificationsFcmDeviceInfoMessage } from '../messages'

/**
 * Handler for incoming fcm push notification device info messages
 */
export class PushNotificationsFcmDeviceInfoHandler implements DidCommMessageHandler {
  public supportedMessages = [PushNotificationsFcmDeviceInfoMessage]

  /**
  /* We don't really need to do anything with this at the moment
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(inboundMessage: DidCommMessageHandlerInboundMessage<PushNotificationsFcmDeviceInfoHandler>) {
    inboundMessage.assertReadyConnection()
    return undefined
  }
}
