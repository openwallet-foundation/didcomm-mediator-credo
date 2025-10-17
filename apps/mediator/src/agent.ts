import type { Socket } from 'node:net'
import { Agent } from '@credo-ts/core'
import {
  DidCommHttpOutboundTransport,
  DidCommMimeType,
  DidCommModule,
  DidCommOutOfBandRole,
  DidCommOutOfBandState,
  DidCommWsOutboundTransport,
} from '@credo-ts/didcomm'

import { AskarStoreDuplicateError } from '@credo-ts/askar'
import Redis from 'ioredis'

import { DidCommHttpInboundTransport, DidCommWsInboundTransport, agentDependencies } from '@credo-ts/node'

import express, { type Express } from 'express'
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
  app,
  socketServer,
}: {
  queueTransportRepository: ExtendedQueueTransportRepository
  app: Express
  socketServer: Server
}) {
  const modules = {
    didcomm: new DidCommModule({
      endpoints: config.agentEndpoints,
      useDidSovPrefixWhereAllowed: true,
      didCommMimeType: DidCommMimeType.V0,
      queueTransportRepository,

      transports: {
        inbound: [
          new DidCommHttpInboundTransport({ app, port: config.agentPort }),
          new DidCommWsInboundTransport({ server: socketServer }),
        ],
        outbound: [new DidCommHttpOutboundTransport(), new DidCommWsOutboundTransport()],
      },

      connections: {
        autoAcceptConnections: true,
      },
      mediator: {
        autoAcceptMediationRequests: true,
        messageForwardingStrategy: config.messagePickup.forwardingStrategy,
      },

      // Protocols not needed for mediator
      basicMessages: false,
      credentials: false,
      proofs: false,
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
  const redisClient = config.cache.type === 'redis' ? new Redis(config.cache.redisUrl) : undefined

  const queueTransportRepository = await loadMessagePickupStorage()
  const storageModules = loadStorage()
  const askarModules = await loadAskar()
  const cacheModules = loadCacheStorage({
    redisClient,
  })

  const modules = {
    ...storageModules,
    ...askarModules,
    ...cacheModules,
    ...(await createModules({
      queueTransportRepository,
      app,
      socketServer,
    })),
  } as const

  const agent = new Agent<typeof modules & { askar: AskarModule }>({
    config: {
      logger,
      autoUpdateStorageOnStartup: true,
    },
    dependencies: agentDependencies,
    modules: modules as typeof modules & { askar: AskarModule },
  })

  // Added health check endpoint
  app.get('/health', async (_req, res) => {
    res.sendStatus(202)
  })

  app.get('/invite', async (req, res) => {
    if (!req.query._oobid || typeof req.query._oobid !== 'string') {
      return res.status(400).send('Missing or invalid _oobid')
    }

    const outOfBandRecord = await agent.didcomm.oob.findById(req.query._oobid)

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

  const inboundTransport = agent.didcomm.config.inboundTransports.find(
    (transport) => transport instanceof DidCommHttpInboundTransport
  )

  inboundTransport?.server?.on('listening', () => {
    logger.info(`Agent listening on port ${config.agentPort}`)
  })

  inboundTransport?.server?.on('error', (err) => {
    logger.error(`Agent failed to start on port ${config.agentPort}`, err)
  })

  inboundTransport?.server?.on('close', () => {
    logger.info(`Agent stopped listening on port ${config.agentPort}`)
  })

  // When an 'upgrade' to WS is made on our http server, we forward the
  // request to the WS server
  inboundTransport?.server?.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket as Socket, head, (socket) => {
      socketServer.emit('connection', socket, request)
    })
  })

  await loadPushNotificationSender(agent)
  await loadRedisMessageDelivery({ agent, redisClient })

  return agent
}

export type MediatorAgent = Agent<Awaited<ReturnType<typeof createModules>>>
