import { AgentContext, injectable } from '@credo-ts/core'
import {
  DidCommConnectionService,
  DidCommMessageHandlerRegistry,
  DidCommMessageSender,
  DidCommOutboundMessageContext,
} from '@credo-ts/didcomm'
import {
  DidCommPushNotificationsFcmDeviceInfoHandler,
  DidCommPushNotificationsFcmProblemReportHandler,
  DidCommPushNotificationsFcmSetDeviceInfoHandler,
} from './handlers/index.js'
import type { DidCommFcmDeviceInfo } from './models/index.js'
import { DidCommPushNotificationsFcmRecord } from './repository/DidCommPushNotificationsFcmRecord.js'
import { DidCommPushNotificationsFcmService } from './services/DidCommPushNotificationsFcmService.js'

@injectable()
export class DidCommPushNotificationsFcmApi {
  private messageSender: DidCommMessageSender
  private pushNotificationsService: DidCommPushNotificationsFcmService
  private connectionService: DidCommConnectionService
  private agentContext: AgentContext

  public constructor(
    messageSender: DidCommMessageSender,
    pushNotificationsService: DidCommPushNotificationsFcmService,
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
        new DidCommPushNotificationsFcmSetDeviceInfoHandler(this.pushNotificationsService),
        new DidCommPushNotificationsFcmDeviceInfoHandler(),
        new DidCommPushNotificationsFcmProblemReportHandler(),
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
  public async deviceInfo(options: { connectionId: string; threadId: string; deviceInfo: DidCommFcmDeviceInfo }) {
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
  public async getPushNotificationRecordByConnectionId(
    connectionId: string
  ): Promise<DidCommPushNotificationsFcmRecord> {
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
