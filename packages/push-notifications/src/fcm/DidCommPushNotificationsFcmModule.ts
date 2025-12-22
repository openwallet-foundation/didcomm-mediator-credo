import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { DidCommPushNotificationsFcmApi } from './DidCommPushNotificationsFcmApi.js'
import { DidCommPushNotificationsFcmRole } from './models/index.js'
import { DidCommPushNotificationsFcmRepository } from './repository/index.js'
import { DidCommPushNotificationsFcmService } from './services/DidCommPushNotificationsFcmService.js'

/**
 * Module that exposes push notification get and set functionality
 */
export class DidCommPushNotificationsFcmModule implements Module {
  public readonly api = DidCommPushNotificationsFcmApi

  public register(dependencyManager: DependencyManager): void {
    // Api
    dependencyManager.registerContextScoped(DidCommPushNotificationsFcmApi)

    // Services
    dependencyManager.registerSingleton(DidCommPushNotificationsFcmService)

    // Repository
    dependencyManager.registerSingleton(DidCommPushNotificationsFcmRepository)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    // Feature Registry
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)

    // Feature Registry
    featureRegistry.register(
      new DidCommProtocol({
        id: 'https://didcomm.org/push-notifications-fcm/1.0',
        roles: [DidCommPushNotificationsFcmRole.Sender, DidCommPushNotificationsFcmRole.Receiver],
      })
    )
  }
}
