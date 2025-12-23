import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { DidCommPushNotificationsFcmGetDeviceInfoMessage } from '../messages/index.js'

/**
 * Handler for incoming push notification device info messages
 */
export class DidCommPushNotificationsFcmGetDeviceInfoHandler implements DidCommMessageHandler {
  public supportedMessages = [DidCommPushNotificationsFcmGetDeviceInfoMessage]

  /**
  /* We don't really need to do anything with this at the moment
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(
    inboundMessage: DidCommMessageHandlerInboundMessage<DidCommPushNotificationsFcmGetDeviceInfoHandler>
  ) {
    inboundMessage.assertReadyConnection()
    return undefined
  }
}
