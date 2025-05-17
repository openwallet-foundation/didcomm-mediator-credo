import type { MessageHandler, MessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { PushNotificationsFcmProblemReportMessage } from '../messages'

/**
 * Handler for incoming push notification problem report messages
 */
export class PushNotificationsFcmProblemReportHandler implements MessageHandler {
  public supportedMessages = [PushNotificationsFcmProblemReportMessage]

  /**
  /* We don't really need to do anything with this at the moment
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(inboundMessage: MessageHandlerInboundMessage<PushNotificationsFcmProblemReportHandler>) {
    inboundMessage.assertReadyConnection()
    return undefined
  }
}
