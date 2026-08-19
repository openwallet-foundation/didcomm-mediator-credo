import { describe, expect, test } from 'vitest'
import { KeyedSingleFlight } from './KeyedSingleFlight.js'

function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

describe('KeyedSingleFlight', () => {
  test('coalesces a synchronous burst into one run', async () => {
    let taskCalls = 0
    const singleFlight = new KeyedSingleFlight(async () => {
      taskCalls += 1
      return taskCalls
    })

    const first = singleFlight.schedule('connection-1')
    const second = singleFlight.schedule('connection-1')
    const third = singleFlight.schedule('connection-1')

    expect(second).toBe(first)
    expect(third).toBe(first)
    await expect(first).resolves.toBe(1)
    expect(taskCalls).toBe(1)
  })

  test('serializes a connection and coalesces concurrent triggers into one follow-up', async () => {
    const firstRunStarted = deferred()
    const releaseFirstRun = deferred()
    let activeTasks = 0
    let maximumActiveTasks = 0
    let taskCalls = 0

    const singleFlight = new KeyedSingleFlight(async () => {
      taskCalls += 1
      activeTasks += 1
      maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks)

      if (taskCalls === 1) {
        firstRunStarted.resolve()
        await releaseFirstRun.promise
      }

      activeTasks -= 1
      return taskCalls
    })

    const first = singleFlight.schedule('connection-1')
    await firstRunStarted.promise
    const second = singleFlight.schedule('connection-1')
    const third = singleFlight.schedule('connection-1')

    expect(second).toBe(first)
    expect(third).toBe(first)

    releaseFirstRun.resolve()
    await expect(first).resolves.toBe(2)
    expect(taskCalls).toBe(2)
    expect(maximumActiveTasks).toBe(1)
  })

  test('runs different connections concurrently', async () => {
    const bothRunsStarted = deferred()
    const releaseRuns = deferred()
    let activeTasks = 0
    let maximumActiveTasks = 0

    const singleFlight = new KeyedSingleFlight(async (connectionId: string) => {
      activeTasks += 1
      maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks)
      if (activeTasks === 2) bothRunsStarted.resolve()

      await releaseRuns.promise
      activeTasks -= 1
      return connectionId
    })

    const first = singleFlight.schedule('connection-1')
    const second = singleFlight.schedule('connection-2')
    await bothRunsStarted.promise

    expect(maximumActiveTasks).toBe(2)
    releaseRuns.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual(['connection-1', 'connection-2'])
  })

  test('clears a failed flight so a later trigger can retry', async () => {
    let shouldFail = true
    const singleFlight = new KeyedSingleFlight(async () => {
      if (shouldFail) throw new Error('delivery failed')
      return 'delivered'
    })

    await expect(singleFlight.schedule('connection-1')).rejects.toThrow('delivery failed')

    shouldFail = false
    await expect(singleFlight.schedule('connection-1')).resolves.toBe('delivered')
  })
})
