import type { Socket } from 'node:net'
import { Agent } from '@credo-ts/core'
import {
  DidCommConnectionsModule,
  DidCommHttpOutboundTransport,
  DidCommMediatorModule,
  DidCommMimeType,
  DidCommOutOfBandRole,
  DidCommOutOfBandState,
  DidCommWsOutboundTransport,
  getDefaultDidcommModules,
} from '@credo-ts/didcomm'

// FIXME: export from askar root
import { AskarStoreDuplicateError } from '@credo-ts/askar/build/error/AskarStoreDuplicateError'

import { DidCommHttpInboundTransport, DidCommWsInboundTransport, agentDependencies } from '@credo-ts/node'

import express from 'express'
import { Server } from 'ws'

import { AskarModule } from '@credo-ts/askar'
import { config, logger } from './config'
import { loadAskar } from './config/askarLoader'
import { loadCacheStorage } from './config/cacheLoader'
import { ExtendedQueueTransportRepository, loadMessagePickupStorage } from './config/messagePickupLoader'
import { loadPushNotificationSender } from './config/pushNotificationLoader'
import { loadRedisMessageDelivery } from './config/redisMessageDeliveryLoader'
import { loadStorage } from './config/storageLoader'
import { PushNotificationsFcmModule } from './push-notifications/fcm'

async function createModules({
  queueTransportRepository,
}: {
  queueTransportRepository: ExtendedQueueTransportRepository
}) {
  const modules = {
    ...getDefaultDidcommModules({
      endpoints: config.agentEndpoints,
      useDidSovPrefixWhereAllowed: true,
      didCommMimeType: DidCommMimeType.V0,
      queueTransportRepository,
    }),
    connections: new DidCommConnectionsModule({
      autoAcceptConnections: true,
    }),
    mediator: new DidCommMediatorModule({
      autoAcceptMediationRequests: true,
      messageForwardingStrategy: config.messagePickup.forwardingStrategy,
    }),
    pushNotificationsFcm: new PushNotificationsFcmModule(),
  } as const

  return modules
}

export async function createAgent() {
  // We create our own instance of express here. This is not required
  // but allows use to use the same server (and port) for both WebSockets and HTTP
  const app = express()
  const socketServer = new Server({ noServer: true })

  const queueTransportRepository = await loadMessagePickupStorage()
  const storageModules = loadStorage()
  const askarModules = await loadAskar()
  const cacheModules = loadCacheStorage()

  const modules = {
    ...storageModules,
    ...askarModules,
    ...cacheModules,
    ...(await createModules({ queueTransportRepository })),
  } as const

  const agent = new Agent<typeof modules & { askar: AskarModule }>({
    config: {
      logger,
      autoUpdateStorageOnStartup: true,
    },
    dependencies: agentDependencies,
    modules: modules as typeof modules & { askar: AskarModule },
  })

  // Create all transports
  const httpInboundTransport = new DidCommHttpInboundTransport({ app, port: config.agentPort })
  const httpOutboundTransport = new DidCommHttpOutboundTransport()
  const wsInboundTransport = new DidCommWsInboundTransport({ server: socketServer })
  const wsOutboundTransport = new DidCommWsOutboundTransport()

  // Register all Transports
  agent.modules.didcomm.registerInboundTransport(httpInboundTransport)
  agent.modules.didcomm.registerOutboundTransport(httpOutboundTransport)
  agent.modules.didcomm.registerInboundTransport(wsInboundTransport)
  agent.modules.didcomm.registerOutboundTransport(wsOutboundTransport)

  // Added health check endpoint
  httpInboundTransport.app.get('/health', async (_req, res) => {
    res.sendStatus(202)
  })

  httpInboundTransport.app.get('/invite', async (req, res) => {
    if (!req.query._oobid || typeof req.query._oobid !== 'string') {
      return res.status(400).send('Missing or invalid _oobid')
    }

    const outOfBandRecord = await agent.modules.oob.findById(req.query._oobid)

    if (
      !outOfBandRecord ||
      outOfBandRecord.role !== DidCommOutOfBandRole.Sender ||
      outOfBandRecord.state !== DidCommOutOfBandState.AwaitResponse
    ) {
      return res.status(400).send(`No invitation found for _oobid ${req.query._oobid}`)
    }

    return res.send(outOfBandRecord.outOfBandInvitation.toJSON())
  })

  try {
    await agent.modules.askar.provisionStore()
    agent.config.logger.info('Provisioned store')
  } catch (error) {
    if (error instanceof AskarStoreDuplicateError) {
      agent.config.logger.info('Store already exists')
    } else {
      agent.config.logger.error('Error provisioning store', {
        error,
      })
    }
  }

  // Optionally initialize queue transport repository
  // TODO: We should refactor this so it's handled by the agent.initialize (using a module?)
  await queueTransportRepository.initialize?.(agent)

  await agent.initialize()

  httpInboundTransport.server?.on('listening', () => {
    logger.info(`Agent listening on port ${config.agentPort}`)
  })

  httpInboundTransport.server?.on('error', (err) => {
    logger.error(`Agent failed to start on port ${config.agentPort}`, err)
  })

  httpInboundTransport.server?.on('close', () => {
    logger.info(`Agent stopped listening on port ${config.agentPort}`)
  })

  // When an 'upgrade' to WS is made on our http server, we forward the
  // request to the WS server
  httpInboundTransport.server?.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket as Socket, head, (socket) => {
      socketServer.emit('connection', socket, request)
    })
  })

  await loadPushNotificationSender(agent)
  await loadRedisMessageDelivery({ agentContext: agent.context })

  return agent
}

export type MediatorAgent = Agent<Awaited<ReturnType<typeof createModules>>>
