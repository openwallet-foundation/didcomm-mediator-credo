import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { PushNotificationsFcmSetDeviceInfoMessage } from '../messages/index.js'
import type { PushNotificationsFcmService } from '../services/PushNotificationsFcmService.js'

/**
 * Handler for incoming push notification device info messages
 */
export class PushNotificationsFcmSetDeviceInfoHandler implements DidCommMessageHandler {
  private pushNotificationsFcmService: PushNotificationsFcmService
  public supportedMessages = [PushNotificationsFcmSetDeviceInfoMessage]

  public constructor(pushNotificationsFcmService: PushNotificationsFcmService) {
    this.pushNotificationsFcmService = pushNotificationsFcmService
  }

  /**
  /* Only perform checks about message fields
  /*
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(inboundMessage: DidCommMessageHandlerInboundMessage<PushNotificationsFcmSetDeviceInfoHandler>) {
    await this.pushNotificationsFcmService.processSetDeviceInfo(inboundMessage)
    return undefined
  }
}
