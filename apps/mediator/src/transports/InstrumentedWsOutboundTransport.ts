import { LogLevel } from '@credo-ts/core'
import { type DidCommOutboundPackage, DidCommWsOutboundTransport } from '@credo-ts/didcomm'

import { durationMs, emitStructured, makeSpanId, monoNow, tryExtractJweFp } from '../logger/StructuredLogger.js'

// WS outbound is only used to push to mobile wallet recipients (the controller
// is reached over HTTP). Every send here is therefore a live-mode delivery, so
// it doubles as the `forward.strategy.decision = live` log point. jwe_fp is the
// inner iv being delivered — it joins to the recipient's inbound and to the
// outer iv via the mediator.forward.bridge line.
export class InstrumentedWsOutboundTransport extends DidCommWsOutboundTransport {
  public async sendMessage(outboundPackage: DidCommOutboundPackage): Promise<void> {
    const spanId = makeSpanId()
    const startMono = monoNow()
    const targetUrl = outboundPackage.endpoint ?? ''
    const jweFp = tryExtractJweFp(outboundPackage.payload)

    emitStructured(LogLevel.info, {
      hop: 'mediator.forward.strategy.decision',
      conn_id: outboundPackage.connectionId ?? '',
      jwe_fp: jweFp,
      decision: 'live',
    })

    emitStructured(LogLevel.info, {
      hop: 'mediator.live.delivery.start',
      span_id: spanId,
      jwe_fp: jweFp,
      conn_id: outboundPackage.connectionId ?? '',
      target_url: targetUrl,
    })

    try {
      await super.sendMessage(outboundPackage)
      emitStructured(LogLevel.info, {
        hop: 'mediator.live.delivery.end',
        span_id: spanId,
        jwe_fp: jweFp,
        conn_id: outboundPackage.connectionId ?? '',
        target_url: targetUrl,
        duration_ms: durationMs(startMono),
        status: 'ok',
      })
    } catch (err) {
      emitStructured(LogLevel.info, {
        hop: 'mediator.live.delivery.end',
        span_id: spanId,
        jwe_fp: jweFp,
        conn_id: outboundPackage.connectionId ?? '',
        target_url: targetUrl,
        duration_ms: durationMs(startMono),
        status: 'error',
        notes: err instanceof Error ? err.message.slice(0, 120) : 'unknown error',
      })
      throw err
    }
  }
}
