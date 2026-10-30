import { AgentContext } from '@credo-ts/core'
import {
  DidCommBasicMessage,
  DidCommConnectionRecord,
  DidCommConnectionRepository,
  DidCommDidExchangeRole,
  DidCommDidExchangeState,
  DidCommInboundMessageContext,
  DidCommMediationRequestMessage,
  DidCommMessage,
  DidCommMessageHandlerMiddleware,
  DidCommMessagePickupEventTypes,
  DidCommMessagePickupSession,
  DidCommMessagePickupSessionRole,
  DidCommMessagePickupSessionService,
  DidCommQueueTransportRepository,
  DidCommTransportService,
  DidCommTrustPingMessage,
  QueuedDidCommMessage,
} from '@credo-ts/didcomm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediatorAgent } from '../agent.js'
import { registerImplicitLiveMode } from '../live-mode/implicitLiveSessionMiddleware.js'

const payload = { protected: 'p', iv: 'i', ciphertext: 'c', tag: 't' }
const queued = (id: string): QueuedDidCommMessage => ({ id, encryptedMessage: payload, receivedAt: new Date() })

describe('implicit live mode', () => {
  let middleware: DidCommMessageHandlerMiddleware
  let onLiveSessionRemoved: (event: { payload: { session: DidCommMessagePickupSession } }) => void
  let agentContext: AgentContext
  let connection: DidCommConnectionRecord
  let liveSessions: DidCommMessagePickupSession[]
  let transportSessions: Record<string, { type: string; send: ReturnType<typeof vi.fn> }>
  let queue: { takeFromQueue: ReturnType<typeof vi.fn>; removeMessages: ReturnType<typeof vi.fn> }
  let connectionRepository: { update: ReturnType<typeof vi.fn> }
  let next: ReturnType<typeof vi.fn>

  const pickupSessionService = {
    getLiveSessionByConnectionId: vi.fn((_context: AgentContext, { connectionId }: { connectionId: string }) =>
      liveSessions.find((session) => session.connectionId === connectionId)
    ),
    saveLiveSession: vi.fn((_context: AgentContext, options: Omit<DidCommMessagePickupSession, 'id'>) => {
      liveSessions = [{ id: `live-${liveSessions.length}`, ...options }]
    }),
  }

  const receive = (message: DidCommMessage, sessionId: string | null = 'ws-1') =>
    middleware(
      {
        message,
        connection,
        agentContext,
        sessionId: sessionId ?? undefined,
      } as unknown as DidCommInboundMessageContext,
      next as () => Promise<void>
    )

  beforeEach(() => {
    liveSessions = []
    transportSessions = {
      'ws-1': { type: 'WebSocket', send: vi.fn().mockResolvedValue(undefined) },
      'ws-2': { type: 'WebSocket', send: vi.fn().mockResolvedValue(undefined) },
      'http-1': { type: 'http', send: vi.fn().mockResolvedValue(undefined) },
    }
    queue = {
      takeFromQueue: vi.fn().mockResolvedValue([queued('m1'), queued('m2')]),
      removeMessages: vi.fn().mockResolvedValue(undefined),
    }
    connectionRepository = { update: vi.fn().mockResolvedValue(undefined) }
    next = vi.fn().mockResolvedValue(undefined)
    pickupSessionService.getLiveSessionByConnectionId.mockClear()
    pickupSessionService.saveLiveSession.mockClear()

    connection = new DidCommConnectionRecord({
      state: DidCommDidExchangeState.Completed,
      role: DidCommDidExchangeRole.Responder,
      theirDid: 'did:peer:their',
    })

    const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
    agentContext = {
      config: { logger },
      resolve: (token: unknown) => {
        if (token === DidCommConnectionRepository) return connectionRepository
        if (token === DidCommMessagePickupSessionService) return pickupSessionService
        if (token === DidCommTransportService) return { findSessionById: (id: string) => transportSessions[id] }
        throw new Error(`Unexpected dependency ${String(token)}`)
      },
    } as unknown as AgentContext

    const agent = {
      events: {
        on: (type: string, handler: typeof onLiveSessionRemoved) => {
          if (type === DidCommMessagePickupEventTypes.LiveSessionRemoved) onLiveSessionRemoved = handler
        },
      },
      didcomm: {
        registerMessageHandlerMiddleware: (registered: DidCommMessageHandlerMiddleware) => {
          middleware = registered
        },
      },
    } as unknown as MediatorAgent

    registerImplicitLiveMode(agent, queue as unknown as DidCommQueueTransportRepository)
  })

  it('leaves other messages alone', async () => {
    await receive(new DidCommBasicMessage({ content: 'hi' }))

    expect(next).toHaveBeenCalledOnce()
    expect(pickupSessionService.saveLiveSession).not.toHaveBeenCalled()
    expect(queue.takeFromQueue).not.toHaveBeenCalled()
  })

  it('starts a live session tied to the WebSocket and delivers queued messages over it', async () => {
    await receive(new DidCommTrustPingMessage({}))

    expect(next).toHaveBeenCalledOnce()
    expect(pickupSessionService.saveLiveSession).toHaveBeenCalledWith(agentContext, {
      connectionId: connection.id,
      protocolVersion: 'v2',
      role: DidCommMessagePickupSessionRole.MessageHolder,
      transportSessionId: 'ws-1',
    })
    expect(queue.takeFromQueue).toHaveBeenCalledWith(agentContext, { connectionId: connection.id, limit: 10 })
    expect(transportSessions['ws-1'].send).toHaveBeenCalledTimes(2)
    expect(queue.removeMessages).toHaveBeenCalledWith(agentContext, {
      connectionId: connection.id,
      messageIds: ['m1', 'm2'],
    })
    await vi.waitFor(() => expect(connection.getTag('lastSeen')).toEqual(expect.any(String)))
  })

  it('replaces a live session on another WebSocket but keeps one on the same WebSocket', async () => {
    await receive(new DidCommMediationRequestMessage({}), 'ws-2')
    await receive(new DidCommMediationRequestMessage({}), 'ws-1')
    await receive(new DidCommMediationRequestMessage({}), 'ws-1')

    expect(pickupSessionService.saveLiveSession).toHaveBeenCalledTimes(2)
    expect(liveSessions).toEqual([expect.objectContaining({ transportSessionId: 'ws-1' })])
    expect(queue.takeFromQueue).toHaveBeenCalledTimes(3)
  })

  it('does nothing beyond handling the message without a WebSocket that accepts messages', async () => {
    await receive(new DidCommMediationRequestMessage({}), 'http-1')
    await receive(new DidCommMediationRequestMessage({}), null)

    expect(next).toHaveBeenCalledTimes(2)
    expect(pickupSessionService.saveLiveSession).not.toHaveBeenCalled()
    expect(queue.takeFromQueue).not.toHaveBeenCalled()
  })

  it('answers but ignores a trust ping within 2s of the previous one until the live session ends', async () => {
    await receive(new DidCommTrustPingMessage({}))
    await receive(new DidCommTrustPingMessage({}))

    expect(next).toHaveBeenCalledTimes(2)
    expect(queue.takeFromQueue).toHaveBeenCalledOnce()

    onLiveSessionRemoved({ payload: { session: liveSessions[0] } })
    await receive(new DidCommTrustPingMessage({}))
    expect(queue.takeFromQueue).toHaveBeenCalledTimes(2)
  })

  it('answers the first trust ping on an incomplete connection and starts on the next one', async () => {
    connection.state = DidCommDidExchangeState.ResponseSent

    await receive(new DidCommTrustPingMessage({}))
    expect(next).toHaveBeenCalledOnce()
    expect(connection.getTag('completedConnection')).toBe(true)
    expect(connectionRepository.update).toHaveBeenCalledWith(agentContext, connection)
    expect(queue.takeFromQueue).not.toHaveBeenCalled()

    await receive(new DidCommTrustPingMessage({}))
    expect(queue.takeFromQueue).toHaveBeenCalledOnce()
  })

  it('removes only the messages that were sent', async () => {
    transportSessions['ws-1'].send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('closed'))
    queue.takeFromQueue.mockResolvedValue([queued('m1'), queued('m2'), queued('m3')])

    await receive(new DidCommMediationRequestMessage({}))

    expect(transportSessions['ws-1'].send).toHaveBeenCalledTimes(2)
    expect(queue.removeMessages).toHaveBeenCalledWith(agentContext, { connectionId: connection.id, messageIds: ['m1'] })
  })

  it('does not fail message handling when delivery fails', async () => {
    queue.takeFromQueue.mockRejectedValue(new Error('pool closed'))

    await expect(receive(new DidCommMediationRequestMessage({}))).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
    expect(agentContext.config.logger.error).toHaveBeenCalled()
  })
})
