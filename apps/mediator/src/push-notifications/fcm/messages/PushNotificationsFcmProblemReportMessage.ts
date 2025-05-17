import type { ProblemReportMessageOptions } from '@credo-ts/didcomm'

import { IsValidMessageType, ProblemReportMessage, parseMessageType } from '@credo-ts/didcomm'

export type PushNotificationsFcmProblemReportMessageOptions = ProblemReportMessageOptions

/**
 * @see https://github.com/hyperledger/aries-rfcs/blob/main/features/0035-report-problem/README.md
 * @internal
 */
export class PushNotificationsFcmProblemReportMessage extends ProblemReportMessage {
  @IsValidMessageType(PushNotificationsFcmProblemReportMessage.type)
  public readonly type = PushNotificationsFcmProblemReportMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/push-notifications-fcm/1.0/problem-report')
}
