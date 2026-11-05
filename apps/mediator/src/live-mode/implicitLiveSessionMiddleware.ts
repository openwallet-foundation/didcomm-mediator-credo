import { AgentContext } from '@credo-ts/core'
import {
  DidCommConnectionRecord,
  DidCommConnectionRepository,
  DidCommDidExchangeState,
  DidCommInboundMessageContext,
  DidCommKeylistUpdateMessage,
  DidCommMessage,
  DidCommMessagePickupEventTypes,
  DidCommMessagePickupSessionRole,
  DidCommMessagePickupSessionService,
  DidCommQueueTransportRepository,
  DidCommTransportService,
  DidCommTransportSession,
  DidCommTrustPingMessage,
  MessagePickupLiveSessionRemovedEvent,
} from '@credo-ts/didcomm'
import type { MediatorAgent } from '../agent.js'

const TRUST_PING_DEBOUNCE_MS = 2_000
const DELIVERY_BATCH_SIZE = 10
const EXPLICIT_PICKUP_METADATA_KEY = 'mediator/implicitLiveMode/explicitPickup'
const EXPLICIT_PICKUP_MESSAGE_TYPE =
  /^https:\/\/didcomm\.org\/message-?pickup\/(?:1|2|4)\.\d+\/(?:batch-pickup|status-request|delivery-request|live-delivery-change|messages-received)$/

/**
 * Older clients never send `live-delivery-change`: they keep a WebSocket open and expect queued messages on it.
 * A trust ping or keylist-update over such a WebSocket starts a live session tied to it.
 */
export function registerImplicitLiveMode(
  agent: MediatorAgent,
  queueTransportRepository: DidCommQueueTransportRepository
) {
  const lastTrustPingAt = new Map<string, number>()
  const explicitPickupConnections = new Set<string>()
  const middlewareCreatedLiveSessionIds = new Set<string>()

  agent.events.on<MessagePickupLiveSessionRemovedEvent>(
    DidCommMessagePickupEventTypes.LiveSessionRemoved,
    ({ payload }) => {
      lastTrustPingAt.delete(payload.session.connectionId)
      middlewareCreatedLiveSessionIds.delete(payload.session.id)
    }
  )

  const shouldStartFromTrustPing = (connection: DidCommConnectionRecord) => {
    const now = Date.now()
    const previous = lastTrustPingAt.get(connection.id)
    lastTrustPingAt.set(connection.id, now)
    return previous === undefined || now - previous >= TRUST_PING_DEBOUNCE_MS
  }

  agent.didcomm.registerMessageHandlerMiddleware(async (context, next) => {
    const { connection, message, agentContext } = context
    if (!connection) return next()

    if (isExplicitPickupMessage(message)) {
      explicitPickupConnections.add(connection.id)
      if (!connection.metadata.get(EXPLICIT_PICKUP_METADATA_KEY)) {
        connection.metadata.set(EXPLICIT_PICKUP_METADATA_KEY, { enabled: true })
        try {
          await agentContext.resolve(DidCommConnectionRepository).update(agentContext, connection)
        } catch (error) {
          agentContext.config.logger.warn(
            `[implicitLiveMode] Failed to persist explicit Pickup marker for connection ${connection.id}`,
            { error }
          )
        }
      }
      return next()
    }

    if (
      explicitPickupConnections.has(connection.id) ||
      connection.metadata.get(EXPLICIT_PICKUP_METADATA_KEY) ||
      (!(message instanceof DidCommTrustPingMessage) && !(message instanceof DidCommKeylistUpdateMessage))
    ) {
      return next()
    }

    const isTrustPing = message instanceof DidCommTrustPingMessage
    const wasCompleted = connection.state === DidCommDidExchangeState.Completed

    await next()

    if (
      isTrustPing &&
      (!wasCompleted || connection.state !== DidCommDidExchangeState.Completed || !shouldStartFromTrustPing(connection))
    ) {
      return
    }
    try {
      await startLiveSessionAndDeliver(context, connection, queueTransportRepository, middlewareCreatedLiveSessionIds)
    } catch (error) {
      agentContext.config.logger.error(`[implicitLiveMode] Failed for connection ${connection.id}`, { error })
    }
  })
}

function isExplicitPickupMessage(message: DidCommMessage): boolean {
  return EXPLICIT_PICKUP_MESSAGE_TYPE.test(message.type)
}

async function startLiveSessionAndDeliver(
  context: DidCommInboundMessageContext,
  connection: DidCommConnectionRecord,
  queueTransportRepository: DidCommQueueTransportRepository,
  middlewareCreatedLiveSessionIds: Set<string>
) {
  const { agentContext, sessionId } = context
  // Only set when the message asked for return routing, so the client accepts messages on this socket
  if (!sessionId) return

  const transportSession = agentContext.resolve(DidCommTransportService).findSessionById(sessionId)
  if (transportSession?.type !== 'WebSocket') return

  const pickupSessionService = agentContext.resolve(DidCommMessagePickupSessionService)
  const liveSession = pickupSessionService.getLiveSessionByConnectionId(agentContext, {
    connectionId: connection.id,
    role: DidCommMessagePickupSessionRole.MessageHolder,
  })

  let sessionCreatedByMiddleware = liveSession ? middlewareCreatedLiveSessionIds.has(liveSession.id) : false
  if (liveSession?.transportSessionId !== sessionId) {
    agentContext.config.logger.debug(`[implicitLiveMode] Starting live session for connection ${connection.id}`)
    pickupSessionService.saveLiveSession(agentContext, {
      connectionId: connection.id,
      protocolVersion: 'v2',
      role: DidCommMessagePickupSessionRole.MessageHolder,
      transportSessionId: sessionId,
    })
    const savedLiveSession = pickupSessionService.getLiveSessionByConnectionId(agentContext, {
      connectionId: connection.id,
      role: DidCommMessagePickupSessionRole.MessageHolder,
    })
    if (!savedLiveSession || savedLiveSession.transportSessionId !== sessionId) {
      agentContext.config.logger.warn(
        `[implicitLiveMode] Failed to create live session for connection ${connection.id} on transport session ${sessionId}`
      )
      return
    }
    middlewareCreatedLiveSessionIds.add(savedLiveSession.id)
    sessionCreatedByMiddleware = true
    void updateLastSeen(agentContext, connection)
  }

  if (!sessionCreatedByMiddleware) return

  await deliverQueuedMessages(agentContext, connection, transportSession, queueTransportRepository)
}

async function deliverQueuedMessages(
  agentContext: AgentContext,
  connection: DidCommConnectionRecord,
  transportSession: DidCommTransportSession,
  queueTransportRepository: DidCommQueueTransportRepository
) {
  // Taken messages are only removed once sent; the rest go back to pending after the queue's ack timeout
  const messages = await queueTransportRepository.takeFromQueue(agentContext, {
    connectionId: connection.id,
    limit: DELIVERY_BATCH_SIZE,
  })

  const delivered: string[] = []
  for (const queuedMessage of messages) {
    try {
      await transportSession.send(agentContext, queuedMessage.encryptedMessage)
      delivered.push(queuedMessage.id)
    } catch (error) {
      agentContext.config.logger.warn(
        `[implicitLiveMode] Failed to deliver queued message ${queuedMessage.id} to connection ${connection.id}`,
        { error }
      )
      break
    }
  }

  if (delivered.length > 0) {
    await queueTransportRepository.removeMessages(agentContext, { connectionId: connection.id, messageIds: delivered })
  }
}

async function updateLastSeen(agentContext: AgentContext, connection: DidCommConnectionRecord) {
  try {
    connection.setTag('lastSeen', new Date().toISOString())
    await agentContext.resolve(DidCommConnectionRepository).update(agentContext, connection)
  } catch (error) {
    agentContext.config.logger.warn(`[implicitLiveMode] Failed to update lastSeen for connection ${connection.id}`, {
      error,
    })
  }
}
