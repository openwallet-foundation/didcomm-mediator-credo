import { AgentContext } from '@credo-ts/core'
import {
  DidCommConnectionRecord,
  DidCommConnectionRepository,
  DidCommDidExchangeState,
  DidCommInboundMessageContext,
  DidCommKeylistUpdateMessage,
  DidCommMediationRequestMessage,
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

/**
 * Older clients never send `live-delivery-change`: they keep a WebSocket open and expect queued messages on it.
 * A trust ping, mediate-request or keylist-update over such a WebSocket starts a live session tied to it.
 */
export function registerImplicitLiveMode(
  agent: MediatorAgent,
  queueTransportRepository: DidCommQueueTransportRepository
) {
  const lastTrustPingAt = new Map<string, number>()

  agent.events.on<MessagePickupLiveSessionRemovedEvent>(
    DidCommMessagePickupEventTypes.LiveSessionRemoved,
    ({ payload }) => {
      lastTrustPingAt.delete(payload.session.connectionId)
    }
  )

  const shouldStartFromTrustPing = async (agentContext: AgentContext, connection: DidCommConnectionRecord) => {
    if (connection.state !== DidCommDidExchangeState.Completed && !connection.getTag('completedConnection')) {
      // The first ping may still be completing the connection; the next one starts the session
      connection.setTag('completedConnection', true)
      await agentContext.resolve(DidCommConnectionRepository).update(agentContext, connection)
      return false
    }

    const now = Date.now()
    const previous = lastTrustPingAt.get(connection.id)
    lastTrustPingAt.set(connection.id, now)
    return previous === undefined || now - previous >= TRUST_PING_DEBOUNCE_MS
  }

  agent.didcomm.registerMessageHandlerMiddleware(async (context, next) => {
    const { connection, message, agentContext } = context
    const isTrigger =
      message instanceof DidCommTrustPingMessage ||
      message instanceof DidCommMediationRequestMessage ||
      message instanceof DidCommKeylistUpdateMessage

    if (!connection || !isTrigger) return next()

    let start = true
    if (message instanceof DidCommTrustPingMessage) {
      try {
        start = await shouldStartFromTrustPing(agentContext, connection)
      } catch (error) {
        agentContext.config.logger.warn(`[implicitLiveMode] Failed to tag connection ${connection.id}`, { error })
        start = false
      }
    }

    await next()

    if (!start) return
    try {
      await startLiveSessionAndDeliver(context, connection, queueTransportRepository)
    } catch (error) {
      agentContext.config.logger.error(`[implicitLiveMode] Failed for connection ${connection.id}`, { error })
    }
  })
}

async function startLiveSessionAndDeliver(
  context: DidCommInboundMessageContext,
  connection: DidCommConnectionRecord,
  queueTransportRepository: DidCommQueueTransportRepository
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

  if (liveSession?.transportSessionId !== sessionId) {
    agentContext.config.logger.debug(`[implicitLiveMode] Starting live session for connection ${connection.id}`)
    pickupSessionService.saveLiveSession(agentContext, {
      connectionId: connection.id,
      protocolVersion: 'v2',
      role: DidCommMessagePickupSessionRole.MessageHolder,
      transportSessionId: sessionId,
    })
    void updateLastSeen(agentContext, connection)
  }

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
