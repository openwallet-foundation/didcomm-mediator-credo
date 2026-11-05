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
    vi.useFakeTimers()
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
    vi.useRealTimers()
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

  it.each(['queue shutdown', 'agent shutdown'])('forces exit after 25 seconds of hung %s', async (step) => {
    const neverCompletes = new Promise<void>(() => {})
    if (step === 'queue shutdown') {
      vi.mocked(queueTransportRepository.shutdown)?.mockReturnValue(neverCompletes)
    } else {
      vi.mocked(agent.shutdown).mockReturnValue(neverCompletes)
    }
    registerShutdownHandlers(agent, queueTransportRepository)

    process.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(24_999)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(agent.config.logger.error).toHaveBeenCalledWith(`Shutdown timed out after 25000ms during ${step}`)
    if (step === 'queue shutdown') expect(agent.shutdown).not.toHaveBeenCalled()
  })

  it('clears the deadline after successful cleanup', async () => {
    registerShutdownHandlers(agent, queueTransportRepository)
    process.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)

    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(exit).toHaveBeenCalledOnce()
  })

  it('repeated signals do not repeat cleanup or extend the deadline', async () => {
    vi.mocked(queueTransportRepository.shutdown)?.mockReturnValue(new Promise<void>(() => {}))
    registerShutdownHandlers(agent, queueTransportRepository)
    process.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(20_000)
    process.emit('SIGTERM')
    process.emit('SIGINT')
    await vi.advanceTimersByTimeAsync(5_000)

    expect(queueTransportRepository.shutdown).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('preserves a fatal exit code when an exception occurs during graceful shutdown', async () => {
    let releaseQueue: (() => void) | undefined
    vi.mocked(queueTransportRepository.shutdown)?.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseQueue = resolve
      })
    )
    registerShutdownHandlers(agent, queueTransportRepository)
    process.emit('SIGTERM')
    process.emit('uncaughtException', new Error('during shutdown'))
    releaseQueue?.()
    await vi.advanceTimersByTimeAsync(0)

    expect(queueTransportRepository.shutdown).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('exits unsuccessfully and clears the watchdog if agent shutdown rejects', async () => {
    vi.mocked(agent.shutdown).mockRejectedValue(new Error('agent shutdown failed'))
    registerShutdownHandlers(agent, queueTransportRepository)
    process.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)

    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(agent.config.logger.error).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
