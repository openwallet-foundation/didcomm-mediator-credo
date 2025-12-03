import { AgentContext, injectable } from '@credo-ts/core'
import {
  DidCommConnectionService,
  DidCommMessageHandlerRegistry,
  DidCommMessageSender,
  DidCommOutboundMessageContext,
} from '@credo-ts/didcomm'
import {
  PushNotificationsFcmDeviceInfoHandler,
  PushNotificationsFcmProblemReportHandler,
  PushNotificationsFcmSetDeviceInfoHandler,
} from './handlers'
import type { FcmDeviceInfo } from './models'
import { PushNotificationsFcmRecord } from './repository/PushNotificationsFcmRecord'
import { PushNotificationsFcmService } from './services/PushNotificationsFcmService'

@injectable()
export class PushNotificationsFcmApi {
  private messageSender: DidCommMessageSender
  private pushNotificationsService: PushNotificationsFcmService
  private connectionService: DidCommConnectionService
  private agentContext: AgentContext

  public constructor(
    messageSender: DidCommMessageSender,
    pushNotificationsService: PushNotificationsFcmService,
    connectionService: DidCommConnectionService,
    agentContext: AgentContext
  ) {
    this.messageSender = messageSender
    this.pushNotificationsService = pushNotificationsService
    this.connectionService = connectionService
    this.agentContext = agentContext

    this.agentContext
      .resolve(DidCommMessageHandlerRegistry)
      .registerMessageHandlers([
        new PushNotificationsFcmSetDeviceInfoHandler(this.pushNotificationsService),
        new PushNotificationsFcmDeviceInfoHandler(),
        new PushNotificationsFcmProblemReportHandler(),
      ])
  }

  /**
   * Sends the requested fcm device info (token) to another agent via a `connectionId`
   * Response for `push-notifications-fcm/get-device-info`
   *
   * @param connectionId The connection ID string
   * @param threadId get-device-info message ID
   * @param deviceInfo The FCM device info
   * @returns Promise<void>
   */
  public async deviceInfo(options: { connectionId: string; threadId: string; deviceInfo: FcmDeviceInfo }) {
    const { connectionId, threadId, deviceInfo } = options
    const connection = await this.connectionService.getById(this.agentContext, connectionId)
    connection.assertReady()

    const message = this.pushNotificationsService.createDeviceInfo({ threadId, deviceInfo })

    const outbound = new DidCommOutboundMessageContext(message, {
      agentContext: this.agentContext,
      connection: connection,
    })
    await this.messageSender.sendMessage(outbound)
  }

  /**
   * Get push notification record by `connectionId`
   *
   * @param connectionId The connection ID string
   * @returns Promise<PushNotificationsFcmRecord>
   */
  public async getPushNotificationRecordByConnectionId(connectionId: string): Promise<PushNotificationsFcmRecord> {
    return this.pushNotificationsService.getPushNotificationRecordByConnectionId(this.agentContext, connectionId)
  }

  /**
   * Find push notification record by `connectionId`
   *
   * @param connectionId The connection ID string
   * @returns Promise<PushNotificationsFcmRecord | null>
   */
  public async findPushNotificationRecordByConnectionId(connectionId: string) {
    return this.pushNotificationsService.findPushNotificationRecordByConnectionId(this.agentContext, connectionId)
  }
}
