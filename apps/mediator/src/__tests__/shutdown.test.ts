import { Agent } from '@credo-ts/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtendedQueueTransportRepository } from '../config/messagePickupLoader.js'
import { registerShutdownHandlers } from '../shutdown.js'

const signals = ['SIGTERM', 'SIGINT', 'uncaughtException'] as const

describe('registerShutdownHandlers', () => {
  let calls: string[]
  let agent: Agent
  let queueTransportRepository: ExtendedQueueTransportRepository
  let exit: ReturnType<typeof vi.fn>
  let existingListeners: Map<string, NodeJS.SignalsListener[]>

  beforeEach(() => {
    existingListeners = new Map(
      signals.map((signal) => [signal, process.listeners(signal as NodeJS.Signals) as NodeJS.SignalsListener[]])
    )
    for (const signal of signals) process.removeAllListeners(signal)

    calls = []
    exit = vi.fn((code: number) => calls.push(`exit(${code})`))
    vi.spyOn(process, 'exit').mockImplementation(exit as unknown as typeof process.exit)
    const logger = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    agent = {
      context: {},
      config: { logger },
      shutdown: vi.fn(async () => calls.push('agent.shutdown')),
    } as unknown as Agent
    queueTransportRepository = {
      shutdown: vi.fn(async () => calls.push('queue.shutdown')),
    } as unknown as ExtendedQueueTransportRepository
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const signal of signals) {
      process.removeAllListeners(signal)
      for (const listener of existingListeners.get(signal) ?? []) process.on(signal, listener)
    }
  })

  it('releases the queue before shutting down the agent, once', async () => {
    registerShutdownHandlers(agent, queueTransportRepository)

    process.emit('SIGTERM')
    process.emit('SIGINT')

    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(calls).toEqual(['queue.shutdown', 'agent.shutdown', 'exit(0)'])
    expect(queueTransportRepository.shutdown).toHaveBeenCalledWith(agent.context)
  })

  it('exits with 1 after an uncaught exception', async () => {
    registerShutdownHandlers(agent, queueTransportRepository)

    process.emit('uncaughtException', new Error('boom'))

    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(calls).toEqual(['queue.shutdown', 'agent.shutdown', 'exit(1)'])
    expect(agent.config.logger.fatal).toHaveBeenCalled()
  })

  it('still shuts down the agent and exits with 1 when the queue fails to shut down', async () => {
    vi.mocked(queueTransportRepository.shutdown)?.mockRejectedValueOnce(new Error('pool closed'))
    registerShutdownHandlers(agent, queueTransportRepository)

    process.emit('SIGTERM')

    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(calls).toEqual(['agent.shutdown', 'exit(1)'])
  })
})
