import { AgentContext } from '@credo-ts/core'
import {
  DidCommBasicMessage,
  DidCommConnectionRecord,
  DidCommDidExchangeRole,
  DidCommDidExchangeState,
  DidCommInboundMessageContext,
  DidCommKeylistUpdate,
  DidCommKeylistUpdateAction,
  DidCommKeylistUpdateMessage,
  DidCommMediationRecord,
  DidCommMediationRepository,
  DidCommMediationRole,
  DidCommMediationState,
  DidCommMessage,
  DidCommMessageHandlerMiddleware,
} from '@credo-ts/didcomm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediatorAgent } from '../agent.js'
import { registerRecipientKeyReassignment } from '../mediation/recipientKeyReassignmentMiddleware.js'

const verkey = '8HH5gYEeNc3z7PYXmd54d4x6qAfCNrqQqEB3nS7Zfu7K'
const otherVerkey = '9ZAsjTMB2eEtbdAZnYuQHoaHg8GkPZQqvAHBFGyqrqXx'
const didKey = 'did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG'

describe('recipient key reassignment', () => {
  let middleware: DidCommMessageHandlerMiddleware
  let agentContext: AgentContext
  let connection: DidCommConnectionRecord
  let records: DidCommMediationRecord[]
  let mediationRepository: {
    findSingleByQuery: ReturnType<typeof vi.fn>
    findByQuery: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let next: ReturnType<typeof vi.fn>

  const mediationRecord = (connectionId: string, recipientKeys: string[], state = DidCommMediationState.Granted) =>
    new DidCommMediationRecord({
      connectionId,
      recipientKeys,
      state,
      role: DidCommMediationRole.Mediator,
      threadId: `thread-${connectionId}`,
    })

  const keylistUpdate = (...updates: [string, DidCommKeylistUpdateAction][]) =>
    new DidCommKeylistUpdateMessage({
      updates: updates.map(([recipientKey, action]) => new DidCommKeylistUpdate({ recipientKey, action })),
    })

  const receive = (message: DidCommMessage) =>
    middleware(
      { message, connection, agentContext } as unknown as DidCommInboundMessageContext,
      next as () => Promise<void>
    )

  beforeEach(() => {
    connection = new DidCommConnectionRecord({
      state: DidCommDidExchangeState.Completed,
      role: DidCommDidExchangeRole.Responder,
    })
    records = [mediationRecord(connection.id, []), mediationRecord('old-connection', [verkey, otherVerkey])]
    mediationRepository = {
      findSingleByQuery: vi.fn(async (_context, { connectionId }) =>
        records.find((record) => record.connectionId === connectionId)
      ),
      findByQuery: vi.fn(async (_context, { recipientKeys: [key] }) =>
        records.filter((record) => record.recipientKeys.includes(key))
      ),
      update: vi.fn().mockResolvedValue(undefined),
    }
    next = vi.fn().mockResolvedValue(undefined)
    agentContext = {
      config: { logger: { info: vi.fn(), warn: vi.fn() } },
      resolve: (token: unknown) => {
        if (token === DidCommMediationRepository) return mediationRepository
        throw new Error(`Unexpected dependency ${String(token)}`)
      },
    } as unknown as AgentContext

    const agent = {
      didcomm: {
        registerMessageHandlerMiddleware: (registered: DidCommMessageHandlerMiddleware) => {
          middleware = registered
        },
      },
    } as unknown as MediatorAgent
    registerRecipientKeyReassignment(agent)
  })

  it('moves an added key from other connections before Credo adds it', async () => {
    next.mockImplementation(async () => expect(mediationRepository.update).toHaveBeenCalled())

    await receive(keylistUpdate([verkey, DidCommKeylistUpdateAction.add]))

    expect(records[1].recipientKeys).toEqual([otherVerkey])
    expect(mediationRepository.update).toHaveBeenCalledWith(agentContext, records[1])
    expect(next).toHaveBeenCalledOnce()
  })

  it('accepts keys as did:key', async () => {
    records[1].recipientKeys = ['6ASf5EcmmEHTgDJ4X4ZT5vT6iHVJBXPg5AN5YoTCpGWt']

    await receive(keylistUpdate([didKey, DidCommKeylistUpdateAction.add]))

    expect(mediationRepository.findByQuery).toHaveBeenCalledWith(agentContext, {
      recipientKeys: ['6ASf5EcmmEHTgDJ4X4ZT5vT6iHVJBXPg5AN5YoTCpGWt'],
    })
    expect(records[1].recipientKeys).toEqual([])
  })

  it('ignores removals and keys only this connection holds', async () => {
    records[0].recipientKeys = [otherVerkey]
    records[1].recipientKeys = [verkey]

    await receive(
      keylistUpdate([verkey, DidCommKeylistUpdateAction.remove], [otherVerkey, DidCommKeylistUpdateAction.add])
    )

    expect(mediationRepository.update).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })

  it('does not move keys when this connection has no granted mediation', async () => {
    records[0] = mediationRecord(connection.id, [], DidCommMediationState.Requested)

    await receive(keylistUpdate([verkey, DidCommKeylistUpdateAction.add]))

    expect(mediationRepository.update).not.toHaveBeenCalled()
    expect(records[1].recipientKeys).toEqual([verkey, otherVerkey])
    expect(next).toHaveBeenCalledOnce()
  })

  it('leaves other messages alone', async () => {
    await receive(new DidCommBasicMessage({ content: 'hi' }))

    expect(mediationRepository.findSingleByQuery).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})
