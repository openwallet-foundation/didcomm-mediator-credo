import { describe, expect, test, vi } from 'vitest'
import { RedisStreamMessagePublishing } from './redisStreamMessagePublishing.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe('RedisStreamMessagePublishing', () => {
  test('processes a read batch concurrently and acknowledges every successful entry', async () => {
    const abortController = new AbortController()
    const bothHandlersStarted = deferred()
    const releaseHandlers = deferred()
    let activeHandlers = 0
    let maximumActiveHandlers = 0

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }
    const agent = {
      config: { logger },
      context: { config: { logger } },
      events: { on: vi.fn() },
    }
    const client = {
      xack: vi.fn().mockResolvedValue(1),
      xgroup: vi.fn().mockResolvedValue('OK'),
      xreadgroup: vi.fn().mockResolvedValue([
        [
          'server:server-1:message-publishing',
          [
            ['1-0', ['message', JSON.stringify({ connectionId: 'connection-1' })]],
            ['2-0', ['message', JSON.stringify({ connectionId: 'connection-2' })]],
          ],
        ],
      ]),
    }
    const publishing = new RedisStreamMessagePublishing(agent as never, client as never, 'server-1')

    const listening = publishing.listenForMessages(
      async () => {
        activeHandlers += 1
        maximumActiveHandlers = Math.max(maximumActiveHandlers, activeHandlers)
        if (activeHandlers === 2) {
          abortController.abort()
          bothHandlersStarted.resolve()
        }

        await releaseHandlers.promise
        activeHandlers -= 1
      },
      { signal: abortController.signal }
    )

    await bothHandlersStarted.promise
    expect(maximumActiveHandlers).toBe(2)

    releaseHandlers.resolve()
    await listening

    expect(client.xack).toHaveBeenCalledTimes(2)
    expect(client.xack).toHaveBeenCalledWith('server:server-1:message-publishing', 'default', '1-0')
    expect(client.xack).toHaveBeenCalledWith('server:server-1:message-publishing', 'default', '2-0')
  })

  test('does not let one failed entry block acknowledgement of another entry', async () => {
    const abortController = new AbortController()
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }
    const agent = {
      config: { logger },
      context: { config: { logger } },
      events: { on: vi.fn() },
    }
    const client = {
      xack: vi.fn().mockResolvedValue(1),
      xgroup: vi.fn().mockResolvedValue('OK'),
      xreadgroup: vi.fn().mockResolvedValue([
        [
          'server:server-1:message-publishing',
          [
            ['1-0', ['message', JSON.stringify({ connectionId: 'connection-1' })]],
            ['2-0', ['message', JSON.stringify({ connectionId: 'connection-2' })]],
          ],
        ],
      ]),
    }
    const publishing = new RedisStreamMessagePublishing(agent as never, client as never, 'server-1')

    await publishing.listenForMessages(
      async (message) => {
        if (message.id === '1-0') throw new Error('delivery failed')
        abortController.abort()
      },
      { signal: abortController.signal }
    )

    expect(client.xack).toHaveBeenCalledOnce()
    expect(client.xack).toHaveBeenCalledWith('server:server-1:message-publishing', 'default', '2-0')
    expect(logger.error).toHaveBeenCalledWith('Error processing message 1-0:', {
      error: expect.objectContaining({ message: 'delivery failed' }),
    })
  })
})
