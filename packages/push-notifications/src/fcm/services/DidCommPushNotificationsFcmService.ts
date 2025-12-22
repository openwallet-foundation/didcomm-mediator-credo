import type { AgentContext, Logger } from '@credo-ts/core'
import { CredoError, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import { DidCommInboundMessageContext } from '@credo-ts/didcomm'
import {
  DidCommPushNotificationsFcmProblemReportReason,
  PushNotificationsFcmProblemReportError,
} from '../errors/index.js'
import {
  DidCommPushNotificationsFcmDeviceInfoMessage,
  DidCommPushNotificationsFcmGetDeviceInfoMessage,
  DidCommPushNotificationsFcmSetDeviceInfoMessage,
} from '../messages/index.js'
import type { DidCommFcmDeviceInfo } from '../models/DidCommFcmDeviceInfo.js'
import { DidCommPushNotificationsFcmRecord, DidCommPushNotificationsFcmRepository } from '../repository/index.js'

@injectable()
export class DidCommPushNotificationsFcmService {
  private pushNotificationsFcmRepository: DidCommPushNotificationsFcmRepository
  private logger: Logger

  public constructor(
    pushNotificationsFcmRepository: DidCommPushNotificationsFcmRepository,
    @inject(InjectionSymbols.Logger) logger: Logger
  ) {
    this.pushNotificationsFcmRepository = pushNotificationsFcmRepository
    this.logger = logger
  }

  public createSetDeviceInfo(deviceInfo: DidCommFcmDeviceInfo) {
    if (
      (deviceInfo.deviceToken === null && deviceInfo.devicePlatform !== null) ||
      (deviceInfo.deviceToken !== null && deviceInfo.devicePlatform === null)
    )
      throw new CredoError('Both or none of deviceToken and devicePlatform must be null')

    return new DidCommPushNotificationsFcmSetDeviceInfoMessage(deviceInfo)
  }

  public createGetDeviceInfo() {
    return new DidCommPushNotificationsFcmGetDeviceInfoMessage({})
  }

  public createDeviceInfo(options: { threadId: string; deviceInfo: DidCommFcmDeviceInfo }) {
    const { threadId, deviceInfo } = options
    if (
      (deviceInfo.deviceToken === null && deviceInfo.devicePlatform !== null) ||
      (deviceInfo.deviceToken !== null && deviceInfo.devicePlatform === null)
    )
      throw new CredoError('Both or none of deviceToken and devicePlatform must be null')

    return new DidCommPushNotificationsFcmDeviceInfoMessage({
      threadId,
      deviceToken: deviceInfo.deviceToken,
      devicePlatform: deviceInfo.devicePlatform,
    })
  }

  public async processSetDeviceInfo(
    messageContext: DidCommInboundMessageContext<DidCommPushNotificationsFcmSetDeviceInfoMessage>
  ) {
    const { message, agentContext } = messageContext
    if (
      (message.deviceToken === null && message.devicePlatform !== null) ||
      (message.deviceToken !== null && message.devicePlatform === null)
    ) {
      throw new PushNotificationsFcmProblemReportError('Both or none of deviceToken and devicePlatform must be null', {
        problemCode: DidCommPushNotificationsFcmProblemReportReason.MissingValue,
      })
    }

    const connection = messageContext.assertReadyConnection()

    let pushNotificationsFcmRecord = await this.pushNotificationsFcmRepository.findSingleByQuery(agentContext, {
      connectionId: connection.id,
    })

    if (pushNotificationsFcmRecord) {
      if (pushNotificationsFcmRecord.deviceToken === message.deviceToken) {
        this.logger.debug(`Device token is same for connection ${connection.id}. So skipping update`)
        return
      }

      // Update the record with new device token
      pushNotificationsFcmRecord.deviceToken = message.deviceToken
      // Reset project in case the firebase project might have changed
      pushNotificationsFcmRecord.firebaseProjectId = undefined

      this.logger.debug(`Device token changed for connection ${connection.id}. Updating record`)
      await this.pushNotificationsFcmRepository.update(agentContext, pushNotificationsFcmRecord)
    } else {
      this.logger.debug(`No device info found for connection ${connection.id}. So creating new record`)

      pushNotificationsFcmRecord = new DidCommPushNotificationsFcmRecord({
        connectionId: connection.id,
        deviceToken: message.deviceToken,
        devicePlatform: message.devicePlatform,
      })

      await this.pushNotificationsFcmRepository.save(agentContext, pushNotificationsFcmRecord)
    }
  }

  public async getPushNotificationRecordByConnectionId(
    agentContext: AgentContext,
    connectionId: string
  ): Promise<DidCommPushNotificationsFcmRecord> {
    return await this.pushNotificationsFcmRepository.getSingleByQuery(agentContext, {
      connectionId,
    })
  }

  public async findPushNotificationRecordByConnectionId(agentContext: AgentContext, connectionId: string) {
    return await this.pushNotificationsFcmRepository.findSingleByQuery(agentContext, {
      connectionId,
    })
  }
}
