import type { Socket } from 'node:net'
import { AskarModule, AskarModuleConfigStoreOptions, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import { Agent, CacheModule, InMemoryLruCache } from '@credo-ts/core'
import {
  ConnectionsModule,
  DidCommMimeType,
  HttpOutboundTransport,
  MediatorModule,
  MessagePickupModule,
  OutOfBandRole,
  OutOfBandState,
  WsOutboundTransport,
  getDefaultDidcommModules,
} from '@credo-ts/didcomm'
import { DynamoDbMessagePickupRepository } from '@credo-ts/didcomm-message-pickup-dynamodb'
import { HttpInboundTransport, WsInboundTransport, agentDependencies } from '@credo-ts/node'
import { RedisCache } from '@credo-ts/redis-cache'
import { askar } from '@openwallet-foundation/askar-nodejs'

import express from 'express'
import { Server } from 'ws'

import config from './config'
import { askarPostgresConfig } from './database'
import { Logger } from './logger'
import { PushNotificationsFcmModule } from './push-notifications/fcm'
import { StorageMessageQueueModule } from './storage/StorageMessageQueueModule'

const logger = new Logger(config.get('agent:logLevel'))

async function createModules() {
  // Only load postgres database in production
  const databaseConfig = config.get('db:host') ? askarPostgresConfig : undefined

  const storeConfig: AskarModuleConfigStoreOptions = {
    id: config.get('wallet:name'),
    key: config.get('wallet:key'),
    database: databaseConfig,
  }

  if (databaseConfig) {
    logger.info('Using postgres storage', {
      walletId: storeConfig.id,
      host: databaseConfig.config.host,
    })
  } else {
    logger.info('Using SQlite storage', {
      walletId: storeConfig.id,
    })
  }

  const messagePickupStorage = config.get('messagePickupStorage:type')
  const cacheStorage = config.get('cacheStorage:type')

  const modules = {
    ...getDefaultDidcommModules({
      endpoints: config.get('agent:endpoints'),
      useDidSovPrefixWhereAllowed: true,
      didCommMimeType: DidCommMimeType.V0,
    }),
    connections: new ConnectionsModule({
      autoAcceptConnections: true,
    }),
    ...(messagePickupStorage === 'credo'
      ? {
          storageModule: new StorageMessageQueueModule(),
        }
      : {
          messagePickup: new MessagePickupModule({
            messagePickupRepository: await DynamoDbMessagePickupRepository.initialize({
              region: config.get('messagePickupStorage:region'),
              credentials: {
                accessKeyId: config.get('messagePickupStorage:accessKeyId'),
                secretAccessKey: config.get('messagePickupStorage:secretAccessKey'),
              },
            }),
          }),
        }),

    mediator: new MediatorModule({
      autoAcceptMediationRequests: true,
    }),
    askar: new AskarModule({
      askar,
      store: storeConfig,
      multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
    }),
    cache: new CacheModule({
      cache:
        cacheStorage === 'in-memory'
          ? new InMemoryLruCache({ limit: 500 })
          : new RedisCache(config.get('cacheStorage:url')),
      useCachedStorageService: cacheStorage === 'redis',
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

  const agent = new Agent({
    config: {
      label: config.get('agent:name'),
      logger: logger,
      autoUpdateStorageOnStartup: true,
    },
    dependencies: agentDependencies,
    modules: await createModules(),
  })

  // Create all transports
  const httpInboundTransport = new HttpInboundTransport({ app, port: config.get('agent:port') })
  const httpOutboundTransport = new HttpOutboundTransport()
  const wsInboundTransport = new WsInboundTransport({ server: socketServer })
  const wsOutboundTransport = new WsOutboundTransport()

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
      outOfBandRecord.role !== OutOfBandRole.Sender ||
      outOfBandRecord.state !== OutOfBandState.AwaitResponse
    ) {
      return res.status(400).send(`No invitation found for _oobid ${req.query._oobid}`)
    }

    return res.send(outOfBandRecord.outOfBandInvitation.toJSON())
  })

  try {
    await agent.modules.askar.provisionStore()
    agent.config.logger.info('Provisioned store')
  } catch (error) {
    agent.config.logger.info('Error provisioning store', {
      error,
    })
  }

  await agent.initialize()

  httpInboundTransport.server?.on('listening', () => {
    logger.info(`Agent listening on port ${config.get('agent:port')}`)
  })

  httpInboundTransport.server?.on('error', (err) => {
    logger.error(`Agent failed to start on port ${config.get('agent:port')}`, err)
  })

  httpInboundTransport.server?.on('close', () => {
    logger.info(`Agent stopped listening on port ${config.get('agent:port')}`)
  })

  // When an 'upgrade' to WS is made on our http server, we forward the
  // request to the WS server
  httpInboundTransport.server?.on('upgrade', (request, socket, head) => {
    socketServer.handleUpgrade(request, socket as Socket, head, (socket) => {
      socketServer.emit('connection', socket, request)
    })
  })

  return agent
}

export type MediatorAgent = Agent<Awaited<ReturnType<typeof createModules>>>
