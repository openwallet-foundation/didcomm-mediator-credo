import type { DidCommProblemReportErrorOptions } from '@credo-ts/didcomm'
import { DidCommProblemReportError } from '@credo-ts/didcomm'
import { DidCommPushNotificationsFcmProblemReportMessage } from '../messages/index.js'
import type { DidCommPushNotificationsFcmProblemReportReason } from './DidCommPushNotificationsFcmProblemReportReason.js'

/**
 * @internal
 */
interface DidCommPushNotificationsFcmProblemReportErrorOptions extends DidCommProblemReportErrorOptions {
  problemCode: DidCommPushNotificationsFcmProblemReportReason
}

/**
 * @internal
 */
export class PushNotificationsFcmProblemReportError extends DidCommProblemReportError {
  public problemReport: DidCommPushNotificationsFcmProblemReportMessage

  public constructor(
    public message: string,
    { problemCode }: DidCommPushNotificationsFcmProblemReportErrorOptions
  ) {
    super(message, { problemCode })
    this.problemReport = new DidCommPushNotificationsFcmProblemReportMessage({
      description: {
        en: message,
        code: problemCode,
      },
    })
  }
}
