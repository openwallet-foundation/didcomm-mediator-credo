import * as os from 'node:os'
import { LogLevel } from '@credo-ts/core'

import { getDebugLogLevel } from '../instrumentation/logLevelHolder.js'

// Structured, single-line-JSON debug instrumentation for latency root-causing.
// The field schema and `hop` enum are kept in sync with the sibling repos
// (ngotag-agent-controller, Bhutanndi-app) so the three services' logs can be
// mechanically joined into one per-flow timeline. See Debug/debug-plan.md.
export type HopName =
  | 'mediator.config.dump'
  | 'mediator.http.inbound.received'
  | 'mediator.ws.inbound.received'
  | 'mediator.ws.session.opened'
  | 'mediator.ws.session.closed'
  | 'mediator.forward.bridge'
  | 'mediator.forward.strategy.decision'
  | 'mediator.message.sent'
  | 'mediator.live.session.saved'
  | 'mediator.live.session.removed'
  | 'mediator.pickup.completed'
  | 'mediator.queue.write.start'
  | 'mediator.queue.write.end'
  | 'mediator.queue.depth.sample'
  | 'mediator.live.delivery.start'
  | 'mediator.live.delivery.end'
  | 'mediator.outbound.send.start'
  | 'mediator.outbound.send.end'
  | 'mediator.pickup.request.received'
  | 'mediator.pickup.batch.dispatch.start'
  | 'mediator.pickup.batch.dispatch.end'
  | 'mediator.push.send.start'
  | 'mediator.push.send.end'
  | 'mediator.gauge.snapshot'

export type FlowType = 'connection' | 'issuance' | 'verification' | 'pickup' | 'mediation-coord' | 'lifecycle'

export interface StructuredLogLine {
  hop: HopName
  flow?: FlowType
  thread_id?: string
  jwe_fp?: string
  jwe_fp_in?: string
  jwe_fp_out?: string
  recipient_key_short?: string
  conn_id?: string
  span_id?: string
  duration_ms?: number
  notes?: string
  [key: string]: unknown
}

const TASK_HOST = process.env.ECS_CONTAINER_METADATA_URI ? process.env.HOSTNAME || os.hostname() : os.hostname()

// Returns true if a line at `level` would be emitted by emitStructured.
// Use this to guard expensive field computation (e.g. JSON.parse) before
// building the log line, so turning off debug-level logging avoids the
// per-message parsing cost entirely.
export function isStructuredEnabled(level: LogLevel): boolean {
  return level >= getDebugLogLevel()
}

// Emit a structured instrumentation line to stdout (captured by the log
// aggregator). Gated behind the runtime-toggleable debug level so it can be
// silenced outside a debug window without a redeploy.
export function emitStructured(level: LogLevel, line: StructuredLogLine): void {
  if (level < getDebugLogLevel()) return

  const out: Record<string, unknown> = {
    ts: new Date().toISOString(),
    ts_mono_ns: Number(process.hrtime.bigint()),
    service: 'mediator',
    task_host: TASK_HOST,
    ...line,
  }

  // Drop undefined/empty fields to keep lines compact, except the key
  // correlation fields, whose absence is itself a finding at analysis time.
  const KEEP_EMPTY = new Set(['thread_id', 'jwe_fp', 'jwe_fp_in', 'jwe_fp_out'])
  for (const key of Object.keys(out)) {
    if (out[key] === undefined || out[key] === '') {
      if (!KEEP_EMPTY.has(key)) delete out[key]
    }
  }

  process.stdout.write(`${JSON.stringify(out)}\n`)
}

export function makeSpanId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

export function monoNow(): number {
  return Number(process.hrtime.bigint())
}

export function durationMs(startMono: number): number {
  return Math.round((Number(process.hrtime.bigint()) - startMono) / 1e6)
}

export function truncateKey(key: string): string {
  if (key.length <= 14) return key
  return `${key.slice(0, 6)}…${key.slice(-6)}`
}

// Extracts a truncated recipient key from a raw JWE body. Tries the standard
// JWE General JSON Serialization top-level `recipients` first, then falls back
// to the Aries DIDComm v1 Authcrypt layout (recipients inside the protected
// header). Returns '' on any parse failure.
export function tryExtractRecipientKeyShort(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>

    const topRecipients = parsed.recipients
    if (Array.isArray(topRecipients) && topRecipients.length > 0) {
      const first = topRecipients[0] as Record<string, unknown>
      const hdr = first.header as Record<string, unknown> | undefined
      const kid = hdr?.kid
      if (typeof kid === 'string' && kid.length > 0) return truncateKey(kid)
    }

    const protectedB64 = parsed.protected
    if (typeof protectedB64 !== 'string') return ''
    const headerStr = Buffer.from(protectedB64, 'base64').toString('utf8')
    const header = JSON.parse(headerStr) as Record<string, unknown>
    const innerRecipients = header.recipients
    if (!Array.isArray(innerRecipients) || innerRecipients.length === 0) return ''
    const first = innerRecipients[0] as Record<string, unknown>
    const hdr = first.header as Record<string, unknown> | undefined
    const kid = hdr?.kid
    if (typeof kid === 'string') return truncateKey(kid)
    return ''
  } catch {
    return ''
  }
}

// Extracts the JWE top-level `iv` field as a per-message fingerprint. The `iv`
// is unique per encryption (JWE spec) and visible at both ends of every hop
// without decryption — unlike DIDComm v1 `@id`, which lives inside the
// encrypted payload. Accepts either a parsed object or a raw JSON string.
export function tryExtractJweFp(payload: unknown): string {
  try {
    const parsed: Record<string, unknown> =
      typeof payload === 'string'
        ? (JSON.parse(payload) as Record<string, unknown>)
        : (payload as Record<string, unknown>)
    const iv = parsed?.iv
    return typeof iv === 'string' ? iv : ''
  } catch {
    return ''
  }
}
