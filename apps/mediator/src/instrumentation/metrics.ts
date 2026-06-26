// Shared in-memory counters and rolling windows used by both the 10s gauge
// emitter and the instrumented transports / queue-repository wrapper.

type QueueStatsAccessor = () => Promise<{
  total: number
  oldestAgeMs: number
  top10: Array<{ connId: string; count: number }>
} | null>

let _queueAccessor: QueueStatsAccessor | null = null

// Registered only when the pickup-queue backend can report aggregate depth
// (the in-tree `credo` StorageServiceMessageQueue). For the `postgres` /
// `dynamodb` backends the queue lives in an external store this process does
// not own, so the accessor stays null and `queue_depth_*` gauge fields are
// omitted — use per-write `mediator.queue.depth.sample` (per-connection) and
// `mediator.queue.write.end.duration_ms` growth as indirect signals instead.
export function registerQueueAccessor(fn: QueueStatsAccessor): void {
  _queueAccessor = fn
}

export function getQueueAccessor(): QueueStatsAccessor | null {
  return _queueAccessor
}

type DbPoolStatsAccessor = () => { total: number; idle: number; waiting: number } | null

let _dbPoolAccessor: DbPoolStatsAccessor | null = null

// Registered by the storage loader when the Drizzle Postgres pool is in use, so
// the gauge can expose db_pool_total / db_pool_idle / db_pool_waiting. A growing
// `waiting` under load while latency climbs is the direct signal for the
// "DirectDelivery first request fast, subsequent slow under DB load"
// observation (connection-pool saturation). Null for sqlite/dev.
export function registerDbPoolAccessor(fn: DbPoolStatsAccessor): void {
  _dbPoolAccessor = fn
}

export function getDbPoolAccessor(): DbPoolStatsAccessor | null {
  return _dbPoolAccessor
}

let _wsSessionsActive = 0
const _outboundMs: number[] = []
let _queueWritesLast10s = 0
let _wsOpened10s = 0
let _wsClosed10s = 0

export function wsSessionOpened(): void {
  _wsSessionsActive++
  _wsOpened10s++
}

export function wsSessionClosed(): void {
  _wsSessionsActive = Math.max(0, _wsSessionsActive - 1)
  _wsClosed10s++
}

export function recordOutboundMs(ms: number): void {
  _outboundMs.push(ms)
  if (_outboundMs.length > 1000) _outboundMs.shift()
}

export function recordQueueWrite(): void {
  _queueWritesLast10s++
}

export interface GaugeSnapshot {
  ws_sessions_active: number
  ws_sessions_opened_10s: number
  ws_sessions_closed_10s: number
  outbound_p50_ms: number | null
  outbound_p95_ms: number | null
  outbound_sample_n: number
  queue_writes_10s: number
}

export function snapshotAndReset(): GaugeSnapshot {
  const sorted = [..._outboundMs].sort((a, b) => a - b)
  const n = sorted.length
  const p50 = n > 0 ? sorted[Math.floor(n * 0.5)] : null
  const p95 = n > 0 ? sorted[Math.floor(n * 0.95)] : null

  const snap: GaugeSnapshot = {
    ws_sessions_active: _wsSessionsActive,
    ws_sessions_opened_10s: _wsOpened10s,
    ws_sessions_closed_10s: _wsClosed10s,
    outbound_p50_ms: p50,
    outbound_p95_ms: p95,
    outbound_sample_n: n,
    queue_writes_10s: _queueWritesLast10s,
  }

  _outboundMs.length = 0
  _wsOpened10s = 0
  _wsClosed10s = 0
  _queueWritesLast10s = 0

  return snap
}
