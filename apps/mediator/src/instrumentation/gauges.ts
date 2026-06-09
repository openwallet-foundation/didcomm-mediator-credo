import { LogLevel } from '@credo-ts/core'

import { emitStructured } from '../logger/StructuredLogger.js'
import { getDbPoolAccessor, getQueueAccessor, snapshotAndReset } from './metrics.js'

const GAUGE_INTERVAL_MS = 10_000

let _gaugeTimer: ReturnType<typeof setInterval> | null = null

// Emits one `mediator.gauge.snapshot` line every 10s (fixed cadence so the
// analysis script can resample without alignment guesswork). Carries WS-session
// counters, outbound p50/p95 latency to the controller, queue writes per 10s,
// and — when a queue accessor is registered — aggregate queue depth.
export function startGauges(): void {
  if (_gaugeTimer) return
  _gaugeTimer = setInterval(async () => {
    const snap = snapshotAndReset()

    // Queue stats: fetch with a 1s timeout so a slow DB never stalls the tick.
    let queueFields: Record<string, unknown> = {}
    const accessor = getQueueAccessor()
    if (accessor) {
      try {
        const qSnap = await Promise.race([
          accessor(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
        ])
        if (qSnap) {
          queueFields = {
            queue_depth_total: qSnap.total,
            queue_oldest_age_ms: qSnap.oldestAgeMs,
            queue_depth_top10: qSnap.top10,
          }
        }
      } catch {
        // best-effort — never let a gauge tick throw
      }
    }

    // DB pool stats are in-memory counters on the pg Pool — read synchronously.
    let dbPoolFields: Record<string, unknown> = {}
    const dbAccessor = getDbPoolAccessor()
    if (dbAccessor) {
      try {
        const s = dbAccessor()
        if (s) {
          dbPoolFields = {
            db_pool_total: s.total,
            db_pool_idle: s.idle,
            db_pool_waiting: s.waiting,
          }
        }
      } catch {
        // best-effort
      }
    }

    emitStructured(LogLevel.info, {
      hop: 'mediator.gauge.snapshot',
      flow: 'lifecycle',
      ...snap,
      ...queueFields,
      ...dbPoolFields,
    })
  }, GAUGE_INTERVAL_MS)
  // Don't keep the process alive solely for the gauge.
  if (_gaugeTimer.unref) _gaugeTimer.unref()
}

export function stopGauges(): void {
  if (_gaugeTimer) {
    clearInterval(_gaugeTimer)
    _gaugeTimer = null
  }
}
