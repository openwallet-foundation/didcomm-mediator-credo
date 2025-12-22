import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { DidCommPushNotificationsFcmDeviceInfoMessage } from '../messages/index.js'

/**
 * Handler for incoming fcm push notification device info messages
 */
export class DidCommPushNotificationsFcmDeviceInfoHandler implements DidCommMessageHandler {
  public supportedMessages = [DidCommPushNotificationsFcmDeviceInfoMessage]

  /**
  /* We don't really need to do anything with this at the moment
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(
    inboundMessage: DidCommMessageHandlerInboundMessage<DidCommPushNotificationsFcmDeviceInfoHandler>
  ) {
    inboundMessage.assertReadyConnection()
    return undefined
  }
}
