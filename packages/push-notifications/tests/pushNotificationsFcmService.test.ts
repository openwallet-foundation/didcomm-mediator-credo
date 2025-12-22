import {
  AgentContext,
  ConsoleLogger,
  DependencyManager,
  EventEmitter,
  InjectionSymbols,
  JsonTransformer,
  LogLevel,
} from '@credo-ts/core'
import { DidCommInboundMessageContext, DidCommMessage } from '@credo-ts/didcomm'
import type { MockedClass } from 'vitest'

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { DidCommPushNotificationsFcmModule } from '../src/fcm/DidCommPushNotificationsFcmModule.js'
import { PushNotificationsFcmProblemReportError } from '../src/fcm/errors/index.js'
import { DidCommPushNotificationsFcmRepository } from '../src/fcm/repository/DidCommPushNotificationsFcmRepository.js'
import { DidCommPushNotificationsFcmService } from '../src/fcm/services/DidCommPushNotificationsFcmService.js'

// biome-ignore lint/suspicious/noExplicitAny: no explanation
export type MockedClassConstructor<T extends { new (...args: any[]): any }> = MockedClass<
  T & { new (): InstanceType<T> }
>

vi.mock('../src/fcm/repository/PushNotificationsFcmRepository')
const PushNotificationsFcmRepositoryMock = DidCommPushNotificationsFcmRepository as MockedClassConstructor<
  typeof DidCommPushNotificationsFcmRepository
>

const agentContext = new AgentContext({
  contextCorrelationId: 'test',
  dependencyManager: new DependencyManager(),
})

agentContext.dependencyManager.registerInstance(EventEmitter, { emit: () => {} } as unknown as EventEmitter)
agentContext.dependencyManager.registerInstance(
  DidCommPushNotificationsFcmRepository,
  new PushNotificationsFcmRepositoryMock()
)
agentContext.dependencyManager.registerInstance(InjectionSymbols.Logger, new ConsoleLogger(LogLevel.off))

describe('Push Notifications Fcm ', () => {
  let pushNotificationsService: DidCommPushNotificationsFcmService

  beforeAll(async () => {
    const module = new DidCommPushNotificationsFcmModule()
    await module.initialize(agentContext)
    //pushNotificationsService = new PushNotificationsFcmService()
    pushNotificationsService = agentContext.dependencyManager.resolve(DidCommPushNotificationsFcmService)
  })

  afterAll(async () => {})

  describe('Create fcm set-device-info message', () => {
    test('Should create a valid message with both token and platform', async () => {
      const message = pushNotificationsService.createSetDeviceInfo({
        deviceToken: '1234-1234-1234-1234',
        devicePlatform: 'android',
      })

      const jsonMessage = JsonTransformer.toJSON(message)

      expect(jsonMessage).toEqual({
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/push-notifications-fcm/1.0/set-device-info',
        device_token: '1234-1234-1234-1234',
        device_platform: 'android',
      })
    })

    test('Should create a valid message without token and platform ', async () => {
      const message = pushNotificationsService.createSetDeviceInfo({
        deviceToken: null,
        devicePlatform: null,
      })

      const jsonMessage = JsonTransformer.toJSON(message)

      expect(jsonMessage).toEqual({
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/push-notifications-fcm/1.0/set-device-info',
        device_token: null,
        device_platform: null,
      })
    })

    test('Should throw error if either token or platform are missing', async () => {
      expect(() =>
        pushNotificationsService.createSetDeviceInfo({
          deviceToken: 'something',
          devicePlatform: null,
        })
      ).toThrow('Both or none of deviceToken and devicePlatform must be null')

      expect(() =>
        pushNotificationsService.createSetDeviceInfo({
          deviceToken: null,
          devicePlatform: 'something',
        })
      ).toThrow('Both or none of deviceToken and devicePlatform must be null')
    })
  })

  describe('Create fcm get-device-info message', () => {
    test('Should create a valid message ', async () => {
      const message = pushNotificationsService.createGetDeviceInfo()

      const jsonMessage = JsonTransformer.toJSON(message)

      expect(jsonMessage).toEqual({
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/push-notifications-fcm/1.0/get-device-info',
      })
    })
  })

  describe('Create fcm device-info message', () => {
    test('Should create a valid message with both token and platform', async () => {
      const message = pushNotificationsService.createDeviceInfo({
        threadId: '5678-5678-5678-5678',
        deviceInfo: {
          deviceToken: '1234-1234-1234-1234',
          devicePlatform: 'android',
        },
      })

      const jsonMessage = JsonTransformer.toJSON(message)

      expect(jsonMessage).toEqual(
        expect.objectContaining({
          '@id': expect.any(String),
          '@type': 'https://didcomm.org/push-notifications-fcm/1.0/device-info',
          device_token: '1234-1234-1234-1234',
          device_platform: 'android',
          '~thread': expect.objectContaining({ thid: '5678-5678-5678-5678' }),
        })
      )
    })

    test('Should create a valid message without token and platform ', async () => {
      const message = pushNotificationsService.createDeviceInfo({
        threadId: '5678-5678-5678-5678',
        deviceInfo: {
          deviceToken: null,
          devicePlatform: null,
        },
      })

      const jsonMessage = JsonTransformer.toJSON(message)

      expect(jsonMessage).toEqual(
        expect.objectContaining({
          '@id': expect.any(String),
          '@type': 'https://didcomm.org/push-notifications-fcm/1.0/device-info',
          device_token: null,
          device_platform: null,
          '~thread': expect.objectContaining({ thid: '5678-5678-5678-5678' }),
        })
      )
    })

    test('Should throw error if either token or platform are missing', async () => {
      expect(() =>
        pushNotificationsService.createDeviceInfo({
          threadId: '5678-5678-5678-5678',
          deviceInfo: {
            deviceToken: 'something',
            devicePlatform: null,
          },
        })
      ).toThrow('Both or none of deviceToken and devicePlatform must be null')

      expect(() =>
        pushNotificationsService.createDeviceInfo({
          threadId: '5678-5678-5678-5678',
          deviceInfo: {
            deviceToken: null,
            devicePlatform: 'something',
          },
        })
      ).toThrow('Both or none of deviceToken and devicePlatform must be null')
    })
  })

  describe('Process fcm set-device-info message', () => {
    test('Should throw if one of token and platform are missing', async () => {
      const message = pushNotificationsService.createSetDeviceInfo({
        deviceToken: '1234-1234-1234-1234',
        devicePlatform: 'android',
      })

      const inboundMessageContext = createInboundMessageContext(message)
      message.devicePlatform = null
      await expect(pushNotificationsService.processSetDeviceInfo(inboundMessageContext)).rejects.toThrow(
        PushNotificationsFcmProblemReportError
      )

      message.deviceToken = null
      await expect(pushNotificationsService.processSetDeviceInfo(inboundMessageContext)).rejects.not.toThrow(
        PushNotificationsFcmProblemReportError
      )

      message.devicePlatform = 'something'
      await expect(pushNotificationsService.processSetDeviceInfo(inboundMessageContext)).rejects.toThrow(
        PushNotificationsFcmProblemReportError
      )
    })
  })
})

function createInboundMessageContext<T extends DidCommMessage>(message: T): DidCommInboundMessageContext<T> {
  return new DidCommInboundMessageContext(message, { agentContext })
}
