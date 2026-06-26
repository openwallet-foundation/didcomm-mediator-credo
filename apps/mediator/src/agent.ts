import type { Socket } from 'node:net'
import { AskarModule, AskarStoreDuplicateError } from '@credo-ts/askar'
import { Agent, LogLevel } from '@credo-ts/core'
import {
  DidCommHttpOutboundTransport,
  DidCommMediatorService,
  DidCommMimeType,
  DidCommModule,
  DidCommOutOfBandRole,
  DidCommOutOfBandState,
  DidCommTransportService,
  DidCommWsOutboundTransport,
} from '@credo-ts/didcomm'
import { DidCommPushNotificationsFcmModule } from '@credo-ts/didcomm-push-notifications'
import { agentDependencies, DidCommHttpInboundTransport, DidCommWsInboundTransport } from '@credo-ts/node'
import express, { type Express } from 'express'
import Redis from 'ioredis'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import { loadAskar } from './config/askarLoader.js'
import { loadCacheStorage } from './config/cacheLoader.js'
import { ExtendedQueueTransportRepository, loadMessagePickupStorage } from './config/messagePickupLoader.js'
import { loadPushNotificationSender } from './config/pushNotificationLoader.js'
import { loadRedisMessageDelivery } from './config/redisMessageDeliveryLoader.js'
import { loadStorage } from './config/storageLoader.js'
import { config, logger } from './config.js'
import { registerAdminEndpoints } from './instrumentation/adminEndpoint.js'
import { wireEventInstrumentation } from './instrumentation/eventInstrumentation.js'
import { startGauges } from './instrumentation/gauges.js'
import { InstrumentedMediatorService } from './instrumentation/InstrumentedMediatorService.js'
import { InstrumentedQueueTransportRepository } from './instrumentation/InstrumentedQueueTransportRepository.js'
import { registerQueueAccessor, wsSessionClosed, wsSessionOpened } from './instrumentation/metrics.js'
import {
  emitStructured,
  isStructuredEnabled,
  makeSpanId,
  tryExtractJweFp,
  tryExtractRecipientKeyShort,
} from './logger/StructuredLogger.js'
import { StorageServiceMessageQueue } from './storage/StorageMessageQueue.js'
import { InstrumentedHttpOutboundTransport } from './transports/InstrumentedHttpOutboundTransport.js'
import { InstrumentedTransportService } from './transports/InstrumentedTransportService.js'
import { InstrumentedWsOutboundTransport } from './transports/InstrumentedWsOutboundTransport.js'
import { startWsHeartbeat } from './transports/wsHeartbeat.js'

async function createModules({
  queueTransportRepository,
  app,
  socketServer,
}: {
  queueTransportRepository: ExtendedQueueTransportRepository
  app: Express
  socketServer: WebSocketServer
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
        // Instrumented outbound transports only when enabled; otherwise stock.
        outbound: config.instrumentationEnabled
          ? [new InstrumentedHttpOutboundTransport(), new InstrumentedWsOutboundTransport()]
          : [new DidCommHttpOutboundTransport(), new DidCommWsOutboundTransport()],
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
    pushNotificationsFcm: new DidCommPushNotificationsFcmModule(),
  } as const

  return modules
}

function wsDataToString(data: unknown): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return ''
}

// Debug-instrumentation: per-WS-session lifecycle + inbound fingerprint logging.
// Transport-level only (raw `socket.on`, no monkey-patching) — the message-level
// outer↔inner correlation is handled reliably by wireEventInstrumentation() via
// Credo's DidCommMessageProcessed event, which exposes both envelopes.
function instrumentSocketServer(socketServer: WebSocketServer): void {
  socketServer.on('connection', (socket: WebSocket) => {
    const sessionId = makeSpanId()
    wsSessionOpened()
    emitStructured(LogLevel.info, {
      hop: 'mediator.ws.session.opened',
      flow: 'lifecycle',
      span_id: sessionId,
      recipient_key_short: '',
      notes: 'recipient_key resolved on first message',
    })

    socket.on('message', (data) => {
      if (!isStructuredEnabled(LogLevel.debug)) return
      const raw = wsDataToString(data)
      emitStructured(LogLevel.debug, {
        hop: 'mediator.ws.inbound.received',
        span_id: makeSpanId(),
        jwe_fp: raw ? tryExtractJweFp(raw) : '',
        recipient_key_short: raw ? tryExtractRecipientKeyShort(raw) : '',
        session_id: sessionId,
        byte_length: raw.length,
      })
    })

    socket.on('close', () => {
      wsSessionClosed()
      emitStructured(LogLevel.info, {
        hop: 'mediator.ws.session.closed',
        flow: 'lifecycle',
        span_id: sessionId,
        recipient_key_short: '',
      })
    })
  })
}

export async function createAgent() {
  // We create our own instance of express here. This is not required
  // but allows use to use the same server (and port) for both WebSockets and HTTP
  const app = express()
  const socketServer = new WebSocketServer({ noServer: true })
  const redisClient = config.cache.type === 'redis' ? new Redis.default(config.cache.redisUrl) : undefined

  // Master switch — when off, none of the instrumentation below is wired and the
  // mediator runs the stock components (see config.instrumentationEnabled).
  const instrumentationEnabled = config.instrumentationEnabled

  if (instrumentationEnabled) {
    // Runtime log-level toggle endpoint (no-op unless ADMIN_TOKEN is set).
    registerAdminEndpoints(app, config.adminToken)
    // WS session lifecycle + inbound fingerprint logging.
    instrumentSocketServer(socketServer)
  }

  // Flow fix (independent of instrumentation): keep idle live-mode WebSocket
  // connections alive so an intermediary idle timeout doesn't silently drop them
  // and tear down the live pickup session. Set WS_HEARTBEAT_INTERVAL_SECONDS=0 to
  // disable for fully-stock WS behaviour.
  startWsHeartbeat(socketServer, config.wsHeartbeatIntervalSeconds * 1000)

  // Wrap whichever pickup-queue backend is configured (credo | postgres | dynamodb)
  // so the queue-write / dispatch / forward-strategy hops are emitted uniformly.
  // When instrumentation is off the raw backend is used unchanged.
  const baseQueueTransportRepository = await loadMessagePickupStorage()
  const queueTransportRepository = instrumentationEnabled
    ? new InstrumentedQueueTransportRepository(baseQueueTransportRepository)
    : baseQueueTransportRepository
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

  // Debug-instrumentation: HTTP inbound fingerprint logging. Registered AFTER
  // createModules() (so the DidCommHttpInboundTransport's express.text() body
  // parser is already in place and req.body is the raw string) and BEFORE
  // agent.initialize() (which registers the POST handler in start()), so this
  // runs first. The outer iv logged here (jwe_fp) is correlated to the inner iv
  // by the DidCommMessageProcessed bridge — no context propagation needed.
  if (instrumentationEnabled) {
    app.use((req, _res, next) => {
      if (req.method !== 'POST') return next()
      if (!isStructuredEnabled(LogLevel.debug)) return next()
      const rawBody = typeof req.body === 'string' ? req.body : ''
      emitStructured(LogLevel.debug, {
        hop: 'mediator.http.inbound.received',
        span_id: makeSpanId(),
        jwe_fp: rawBody ? tryExtractJweFp(rawBody) : '',
        recipient_key_short: rawBody ? tryExtractRecipientKeyShort(rawBody) : '',
        content_length: req.headers['content-length'] ? Number(req.headers['content-length']) : undefined,
      })
      return next()
    })
  }

  const agent = new Agent<typeof modules & { askar: AskarModule }>({
    config: {
      logger,
      autoUpdateStorageOnStartup: true,
    },
    dependencies: agentDependencies,
    modules: modules as typeof modules & { askar: AskarModule },
  })

  if (instrumentationEnabled) {
    // Override two Credo singletons with instrumented subclasses, to capture the
    // forward-delivery signals that no event/outbound-transport hook can see:
    //   - DidCommTransportService → wraps session.send for the LIVE delivery path
    //     (DirectDelivery's sendPackage uses session.send directly, bypassing
    //     outbound transports).
    //   - DidCommMediatorService → wraps processForwardMessage for the per-forward
    //     strategy decision + Undeliverable outcome (sendPackage / the queue never
    //     emit DidCommMessageSent).
    // Done before agent.initialize() so the override is in place before either
    // service is first resolved (during module init / message handling). The
    // subclasses delegate to super for all behaviour — instrumentation only.
    agent.dependencyManager.registerSingleton(DidCommTransportService, InstrumentedTransportService)
    agent.dependencyManager.registerSingleton(DidCommMediatorService, InstrumentedMediatorService)
  }

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

  if (instrumentationEnabled) {
    // Aggregate queue-depth gauge accessor. Only the in-tree `credo` backend can
    // report total depth from this process; for the external `postgres` /
    // `dynamodb` backends the gauge omits queue_depth_* (use per-write
    // mediator.queue.depth.sample + queue.write duration instead).
    if (baseQueueTransportRepository instanceof StorageServiceMessageQueue) {
      const credoQueue = baseQueueTransportRepository
      registerQueueAccessor(() => credoQueue.getQueueStats(agent.context))
    }

    // Event-driven correlation bridge + live-session churn diagnostics.
    wireEventInstrumentation(agent)

    startGauges()

    emitStructured(LogLevel.info, {
      hop: 'mediator.config.dump',
      flow: 'lifecycle',
      notes: 'effective config at startup',
      instrumentation_enabled: true,
      log_level: config.logLevel,
      message_forwarding_strategy: config.messagePickup.forwardingStrategy,
      message_pickup_storage: config.messagePickup.storage.type,
      multi_instance_delivery: config.messagePickup.multiInstanceDelivery.type,
      cache_type: config.cache.type,
      storage_type: config.storage.type,
      askar_database_type: config.askar.database.type,
      push_notifications_enabled: Boolean(config.pushNotifications.firebase || config.pushNotifications.webhookUrl),
      admin_endpoint_enabled: Boolean(config.adminToken),
      ws_heartbeat_interval_seconds: config.wsHeartbeatIntervalSeconds,
      agent_endpoints: config.agentEndpoints,
    })
  }

  await loadPushNotificationSender(agent)
  await loadRedisMessageDelivery({
    agent,
    // FIXME: somehow reusing the same Redis client makes everything fail
    /* redisClient */
  })

  return agent
}

export type MediatorAgent = Agent<Awaited<ReturnType<typeof createModules>>>
