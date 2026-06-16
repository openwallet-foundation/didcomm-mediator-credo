import { EventEmitter, InjectionSymbols, inject, injectable, type Logger, LogLevel } from '@credo-ts/core'
import {
  DidCommConnectionService,
  type DidCommForwardMessage,
  type DidCommInboundMessageContext,
  DidCommMediationRepository,
  DidCommMediatorRoutingRepository,
  DidCommMediatorService,
} from '@credo-ts/didcomm'

import { config } from '../config.js'
import {
  durationMs,
  emitStructured,
  makeSpanId,
  monoNow,
  truncateKey,
  tryExtractJweFp,
} from '../logger/StructuredLogger.js'

// Instruments the mediator forward path directly, because the underlying
// delivery (DidCommMessageSender.sendPackage for DirectDelivery, or the pickup
// queue for QueueOnly / QueueAndLiveModeDelivery) does NOT emit
// DidCommMessageSent — so the DidCommMessageSent listener in
// eventInstrumentation never sees forwarded user traffic.
//
// processForwardMessage is the single entry point for every forwarded message,
// so wrapping it gives us, per forward:
//   - mediator.forward.strategy.decision — the configured strategy + recipient
//   - the Undeliverable outcome (sendPackage throws when no session / no
//     transport / no queue is available; DirectDelivery has no queue fallback)
//
// The successful-delivery breakdown (live vs queue vs service-endpoint) is
// emitted by the layers sendPackage actually flows through:
//   - InstrumentedTransportService          → live session.send (SentToSession)
//   - InstrumentedQueueTransportRepository   → queue write (QueuedForPickup)
//   - Instrumented*OutboundTransport         → service endpoint (SentToTransport)
//
// Registered on the DidCommMediatorService DI token (see agent.ts) only when
// instrumentation is enabled; otherwise the stock service is used unchanged.
@injectable()
export class InstrumentedMediatorService extends DidCommMediatorService {
  public constructor(
    mediationRepository: DidCommMediationRepository,
    mediatorRoutingRepository: DidCommMediatorRoutingRepository,
    eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) logger: Logger,
    connectionService: DidCommConnectionService
  ) {
    super(mediationRepository, mediatorRoutingRepository, eventEmitter, logger, connectionService)
  }

  public override async processForwardMessage(
    messageContext: DidCommInboundMessageContext<DidCommForwardMessage>
  ): Promise<void> {
    const spanId = makeSpanId()
    const startMono = monoNow()
    const { message } = messageContext

    // The inner (forwarded) JWE iv — joins to mediator.forward.bridge.jwe_fp_out
    // and to the recipient's inbound. Best-effort; never let it disturb routing.
    let jweFp = ''
    let recipientKeyShort = ''
    try {
      jweFp = tryExtractJweFp(message.message)
      recipientKeyShort = message.to ? truncateKey(message.to) : ''
    } catch {
      // best-effort
    }

    emitStructured(LogLevel.info, {
      hop: 'mediator.forward.strategy.decision',
      flow: 'pickup',
      span_id: spanId,
      jwe_fp: jweFp,
      recipient_key_short: recipientKeyShort,
      decision: config.messagePickup.forwardingStrategy,
    })

    try {
      await super.processForwardMessage(messageContext)
    } catch (err) {
      // sendPackage throws CredoError when the message is undeliverable (no live
      // session, no outbound transport, no queue). This is the direct signal for
      // the "DirectDelivery first attempt fails, retry works" observation.
      emitStructured(LogLevel.info, {
        hop: 'mediator.message.sent',
        flow: 'pickup',
        span_id: spanId,
        jwe_fp: jweFp,
        recipient_key_short: recipientKeyShort,
        status: 'Undeliverable',
        duration_ms: durationMs(startMono),
        notes: err instanceof Error ? err.message.slice(0, 120) : 'unknown error',
      })
      throw err
    }
  }
}
