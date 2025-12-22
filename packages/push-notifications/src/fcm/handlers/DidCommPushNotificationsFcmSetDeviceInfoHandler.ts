import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { DidCommPushNotificationsFcmSetDeviceInfoMessage } from '../messages/index.js'
import type { DidCommPushNotificationsFcmService } from '../services/DidCommPushNotificationsFcmService.js'

/**
 * Handler for incoming push notification device info messages
 */
export class DidCommPushNotificationsFcmSetDeviceInfoHandler implements DidCommMessageHandler {
  private pushNotificationsFcmService: DidCommPushNotificationsFcmService
  public supportedMessages = [DidCommPushNotificationsFcmSetDeviceInfoMessage]

  public constructor(pushNotificationsFcmService: DidCommPushNotificationsFcmService) {
    this.pushNotificationsFcmService = pushNotificationsFcmService
  }

  /**
  /* Only perform checks about message fields
  /*
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(
    inboundMessage: DidCommMessageHandlerInboundMessage<DidCommPushNotificationsFcmSetDeviceInfoHandler>
  ) {
    await this.pushNotificationsFcmService.processSetDeviceInfo(inboundMessage)
    return undefined
  }
}
