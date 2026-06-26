import { AgentContext, injectable, LogLevel } from '@credo-ts/core'
import { type DidCommEncryptedMessage, DidCommTransportService, type DidCommTransportSession } from '@credo-ts/didcomm'

import { durationMs, emitStructured, makeSpanId, monoNow, tryExtractJweFp } from '../logger/StructuredLogger.js'

// Captures the LIVE-mode delivery path that no outbound transport ever sees.
//
// For the default DirectDelivery strategy, the mediator forward path
// (DidCommMessageSender.sendPackage) first tries an existing inbound transport
// session — `transportService.findSessionByConnectionId(conn).send(...)` — and
// returns on success WITHOUT touching any outbound transport. So the fast,
// common live delivery to a connected mobile wallet is invisible to
// InstrumentedWsOutboundTransport (which only fires on the rarer
// service-endpoint dial-out). QueueAndLiveModeDelivery's pickup delivery
// ultimately pushes over the same session.send too.
//
// We wrap each session's `send` at saveSession() time — the single chokepoint
// through which every live delivery passes, regardless of forwarding strategy —
// and emit mediator.live.delivery.start/end around it. The jwe_fp is the inner
// iv being delivered; it joins to the recipient's inbound and to the outer iv
// via mediator.forward.bridge.
//
// This subclass is registered on the DidCommTransportService DI token (see
// agent.ts) only when instrumentation is enabled; otherwise the stock service
// is used unchanged.

interface InstrumentedSession extends DidCommTransportSession {
  __sendInstrumented?: boolean
}

@injectable()
export class InstrumentedTransportService extends DidCommTransportService {
  public override saveSession(session: DidCommTransportSession): void {
    this.instrumentSessionSend(session as InstrumentedSession)
    super.saveSession(session)
  }

  private instrumentSessionSend(session: InstrumentedSession): void {
    // saveSession can be called repeatedly for the same session object (e.g.
    // setConnectionIdForSession re-saves) — wrap send exactly once.
    if (session.__sendInstrumented) return
    session.__sendInstrumented = true

    const originalSend = session.send.bind(session)
    session.send = async (agentContext: AgentContext, encryptedMessage: DidCommEncryptedMessage): Promise<void> => {
      const spanId = makeSpanId()
      const startMono = monoNow()
      const jweFp = tryExtractJweFp(encryptedMessage)

      emitStructured(LogLevel.info, {
        hop: 'mediator.live.delivery.start',
        flow: 'pickup',
        span_id: spanId,
        jwe_fp: jweFp,
        conn_id: session.connectionId ?? '',
        transport_session_id: session.id,
      })

      try {
        await originalSend(agentContext, encryptedMessage)
        emitStructured(LogLevel.info, {
          hop: 'mediator.live.delivery.end',
          flow: 'pickup',
          span_id: spanId,
          jwe_fp: jweFp,
          conn_id: session.connectionId ?? '',
          transport_session_id: session.id,
          duration_ms: durationMs(startMono),
          status: 'ok',
        })
      } catch (err) {
        emitStructured(LogLevel.info, {
          hop: 'mediator.live.delivery.end',
          flow: 'pickup',
          span_id: spanId,
          jwe_fp: jweFp,
          conn_id: session.connectionId ?? '',
          transport_session_id: session.id,
          duration_ms: durationMs(startMono),
          status: 'error',
          notes: err instanceof Error ? err.message.slice(0, 120) : 'unknown error',
        })
        throw err
      }
    }
  }
}
