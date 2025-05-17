import type { AgentContext, Logger } from '@credo-ts/core'
import { CredoError, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import { InboundMessageContext } from '@credo-ts/didcomm'
import { PushNotificationsFcmProblemReportError, PushNotificationsFcmProblemReportReason } from '../errors'
import { PushNotificationsFcmDeviceInfoMessage, PushNotificationsFcmSetDeviceInfoMessage } from '../messages'
import type { FcmDeviceInfo } from '../models/FcmDeviceInfo'
import { PushNotificationsFcmRecord, PushNotificationsFcmRepository } from '../repository'

@injectable()
export class PushNotificationsFcmService {
  private pushNotificationsFcmRepository: PushNotificationsFcmRepository
  private logger: Logger

  public constructor(
    pushNotificationsFcmRepository: PushNotificationsFcmRepository,
    @inject(InjectionSymbols.Logger) logger: Logger
  ) {
    this.pushNotificationsFcmRepository = pushNotificationsFcmRepository
    this.logger = logger
  }

  public createDeviceInfo(options: { threadId: string; deviceInfo: FcmDeviceInfo }) {
    const { threadId, deviceInfo } = options
    if (
      (deviceInfo.deviceToken === null && deviceInfo.devicePlatform !== null) ||
      (deviceInfo.deviceToken !== null && deviceInfo.devicePlatform === null)
    )
      throw new CredoError('Both or none of deviceToken and devicePlatform must be null')

    return new PushNotificationsFcmDeviceInfoMessage({
      threadId,
      deviceToken: deviceInfo.deviceToken,
      devicePlatform: deviceInfo.devicePlatform,
    })
  }

  public async processSetDeviceInfo(messageContext: InboundMessageContext<PushNotificationsFcmSetDeviceInfoMessage>) {
    const { message, agentContext } = messageContext
    if (
      (message.deviceToken === null && message.devicePlatform !== null) ||
      (message.deviceToken !== null && message.devicePlatform === null)
    ) {
      throw new PushNotificationsFcmProblemReportError('Both or none of deviceToken and devicePlatform must be null', {
        problemCode: PushNotificationsFcmProblemReportReason.MissingValue,
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

      this.logger.debug(`Device token changed for connection ${connection.id}. Updating record`)
      await this.pushNotificationsFcmRepository.update(agentContext, pushNotificationsFcmRecord)
    } else {
      this.logger.debug(`No device info found for connection ${connection.id}. So creating new record`)

      pushNotificationsFcmRecord = new PushNotificationsFcmRecord({
        connectionId: connection.id,
        deviceToken: message.deviceToken,
        devicePlatform: message.devicePlatform,
      })

      await this.pushNotificationsFcmRepository.save(agentContext, pushNotificationsFcmRecord)
    }
  }

  public async getPushNotificationRecordByConnectionId(agentContext: AgentContext, connectionId: string) {
    return await this.pushNotificationsFcmRepository.getSingleByQuery(agentContext, {
      connectionId,
    })
  }
}
