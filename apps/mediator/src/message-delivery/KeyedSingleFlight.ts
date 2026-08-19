interface FlightState<Result> {
  pending: boolean
  promise: Promise<Result>
  started: boolean
}

/**
 * Runs at most one task per key at a time. Triggers received while a task is
 * running are coalesced into one follow-up run, preventing both concurrent
 * delivery and a lost wake-up when a new queue item arrives mid-delivery.
 */
export class KeyedSingleFlight<Key, Result> {
  private readonly flights = new Map<Key, FlightState<Result>>()

  public constructor(private readonly task: (key: Key) => Promise<Result>) {}

  public schedule(key: Key): Promise<Result> {
    const existingFlight = this.flights.get(key)
    if (existingFlight) {
      // Calls made before the task starts are part of the same burst and need
      // only one queue drain. Once a drain has started, retain one follow-up so
      // a message queued after its read cannot be stranded.
      if (existingFlight.started) existingFlight.pending = true
      return existingFlight.promise
    }

    let resolveFlight!: (result: Result | PromiseLike<Result>) => void
    let rejectFlight!: (reason?: unknown) => void
    const promise = new Promise<Result>((resolve, reject) => {
      resolveFlight = resolve
      rejectFlight = reject
    })
    const flight = { pending: true, promise, started: false }
    this.flights.set(key, flight)

    // Start in the next microtask so a synchronous burst for one key collapses
    // into the initial run. The fully initialized flight is visible before
    // task() can schedule more work for the same key.
    queueMicrotask(() => {
      void this.drain(key, flight).then(resolveFlight, rejectFlight)
    })
    return flight.promise
  }

  private async drain(key: Key, flight: FlightState<Result>): Promise<Result> {
    let result: Result

    try {
      flight.started = true
      do {
        flight.pending = false
        result = await this.task(key)
      } while (flight.pending)

      return result
    } finally {
      if (this.flights.get(key) === flight) {
        this.flights.delete(key)
      }
    }
  }
}
