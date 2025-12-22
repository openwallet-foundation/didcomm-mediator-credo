import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { DidCommPushNotificationsFcmProblemReportMessage } from '../messages/index.js'

/**
 * Handler for incoming push notification problem report messages
 */
export class DidCommPushNotificationsFcmProblemReportHandler implements DidCommMessageHandler {
  public supportedMessages = [DidCommPushNotificationsFcmProblemReportMessage]

  /**
  /* We don't really need to do anything with this at the moment
  /* The result can be hooked into through the generic message processed event
   */
  public async handle(
    inboundMessage: DidCommMessageHandlerInboundMessage<DidCommPushNotificationsFcmProblemReportHandler>
  ) {
    inboundMessage.assertReadyConnection()
    return undefined
  }
}
