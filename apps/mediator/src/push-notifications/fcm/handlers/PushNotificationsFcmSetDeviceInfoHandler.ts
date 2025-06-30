import type { MessageHandler, MessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { PushNotificationsFcmSetDeviceInfoMessage } from '../messages'
import type { PushNotificationsFcmService } from '../services/PushNotificationsFcmService'

/**
 * Handler for incoming push notification device info messages
 */
export class PushNotificationsFcmSetDeviceInfoHandler implements MessageHandler {
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
  public async handle(inboundMessage: MessageHandlerInboundMessage<PushNotificationsFcmSetDeviceInfoHandler>) {
    await this.pushNotificationsFcmService.processSetDeviceInfo(inboundMessage)
    return undefined
  }
}
