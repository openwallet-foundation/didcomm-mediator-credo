import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { PushNotificationsFcmRole } from './models/index.js'
import { PushNotificationsFcmApi } from './PushNotificationsFcmApi.js'
import { PushNotificationsFcmRepository } from './repository/index.js'
import { PushNotificationsFcmService } from './services/PushNotificationsFcmService.js'

/**
 * Module that exposes push notification get and set functionality
 */
export class PushNotificationsFcmModule implements Module {
  public readonly api = PushNotificationsFcmApi

  public register(dependencyManager: DependencyManager): void {
    // Api
    dependencyManager.registerContextScoped(PushNotificationsFcmApi)

    // Services
    dependencyManager.registerSingleton(PushNotificationsFcmService)

    // Repository
    dependencyManager.registerSingleton(PushNotificationsFcmRepository)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    // Feature Registry
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)

    // Feature Registry
    featureRegistry.register(
      new DidCommProtocol({
        id: 'https://didcomm.org/push-notifications-fcm/1.0',
        roles: [PushNotificationsFcmRole.Sender, PushNotificationsFcmRole.Receiver],
      })
    )
  }
}
