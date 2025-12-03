import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { PushNotificationsFcmRole } from './models'
import { PushNotificationsFcmApi } from './PushNotificationsFcmApi'
import { PushNotificationsFcmRepository } from './repository'
import { PushNotificationsFcmService } from './services/PushNotificationsFcmService'

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
