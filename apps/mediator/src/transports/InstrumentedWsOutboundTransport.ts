import { LogLevel } from '@credo-ts/core'
import { type DidCommOutboundPackage, DidCommWsOutboundTransport } from '@credo-ts/didcomm'

import { recordOutboundMs } from '../instrumentation/metrics.js'
import { durationMs, emitStructured, makeSpanId, monoNow, tryExtractJweFp } from '../logger/StructuredLogger.js'

// WS *outbound* transport: used only when the mediator dials OUT to a WS service
// endpoint (the rarer service-endpoint branch of sendPackage). This is NOT the
// common live-delivery path — live delivery to a connected mobile wallet reuses
// the existing inbound WS session via session.send(), which is instrumented in
// InstrumentedTransportService (mediator.live.delivery.*). Emitting the same
// neutral mediator.outbound.send.* hops as InstrumentedHttpOutboundTransport
// keeps the two outbound transports symmetric and feeds the outbound p50/p95
// gauge. jwe_fp is the inner iv being delivered — it joins to the recipient's
// inbound and to the outer iv via mediator.forward.bridge.
export class InstrumentedWsOutboundTransport extends DidCommWsOutboundTransport {
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
