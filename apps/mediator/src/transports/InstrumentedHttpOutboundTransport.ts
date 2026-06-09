import { LogLevel } from '@credo-ts/core'
import { DidCommHttpOutboundTransport, type DidCommOutboundPackage } from '@credo-ts/didcomm'
import { recordOutboundMs } from '../instrumentation/metrics.js'
import { durationMs, emitStructured, makeSpanId, monoNow, tryExtractJweFp } from '../logger/StructuredLogger.js'

// HTTP outbound to the agent-controller. Times each send and records the
// latency into the outbound p50/p95 gauge (confirms/refutes mediator→controller
// back-pressure, hypothesis H2 in the debug plan). jwe_fp here (the inner iv for
// forwarded traffic) joins to the recipient side and to mediator.forward.bridge.
export class InstrumentedHttpOutboundTransport extends DidCommHttpOutboundTransport {
  public async sendMessage(outboundPackage: DidCommOutboundPackage): Promise<void> {
    const spanId = makeSpanId()
    const startMono = monoNow()
    const targetUrl = outboundPackage.endpoint ?? ''
    const jweFp = tryExtractJweFp(outboundPackage.payload)

    emitStructured(LogLevel.info, {
      hop: 'mediator.outbound.send.start',
      span_id: spanId,
      jwe_fp: jweFp,
      conn_id: outboundPackage.connectionId ?? '',
      target_url: targetUrl,
    })

    try {
      await super.sendMessage(outboundPackage)
      const elapsed = durationMs(startMono)
      recordOutboundMs(elapsed)
      emitStructured(LogLevel.info, {
        hop: 'mediator.outbound.send.end',
        span_id: spanId,
        jwe_fp: jweFp,
        conn_id: outboundPackage.connectionId ?? '',
        target_url: targetUrl,
        duration_ms: elapsed,
        status: 'ok',
      })
    } catch (err) {
      const elapsed = durationMs(startMono)
      recordOutboundMs(elapsed)
      emitStructured(LogLevel.info, {
        hop: 'mediator.outbound.send.end',
        span_id: spanId,
        jwe_fp: jweFp,
        conn_id: outboundPackage.connectionId ?? '',
        target_url: targetUrl,
        duration_ms: elapsed,
        status: 'error',
        notes: err instanceof Error ? err.message.slice(0, 120) : 'unknown error',
      })
      throw err
    }
  }
}
