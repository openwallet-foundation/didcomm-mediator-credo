import type { DidCommProblemReportMessageOptions } from '@credo-ts/didcomm'

import { DidCommProblemReportMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'

export type DidCommPushNotificationsFcmProblemReportMessageOptions = DidCommProblemReportMessageOptions

/**
 * @see https://github.com/hyperledger/aries-rfcs/blob/main/features/0035-report-problem/README.md
 * @internal
 */
export class DidCommPushNotificationsFcmProblemReportMessage extends DidCommProblemReportMessage {
  @IsValidMessageType(DidCommPushNotificationsFcmProblemReportMessage.type)
  public readonly type = DidCommPushNotificationsFcmProblemReportMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/push-notifications-fcm/1.0/problem-report')
}
