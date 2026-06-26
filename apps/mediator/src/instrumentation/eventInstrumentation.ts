import { LogLevel } from '@credo-ts/core'
import {
  DidCommEventTypes,
  DidCommForwardMessage,
  DidCommMessagePickupEventTypes,
  type DidCommMessagePickupLiveSessionSavedEvent,
  type DidCommMessageProcessedEvent,
  type DidCommMessageReceivedEvent,
  type DidCommMessageSentEvent,
  type MessagePickupCompletedEvent,
  type MessagePickupLiveSessionRemovedEvent,
} from '@credo-ts/didcomm'

import type { MediatorAgent } from '../agent.js'
import { emitStructured, truncateKey, tryExtractJweFp } from '../logger/StructuredLogger.js'

// Event-driven correlation + live-session diagnostics.
//
// This is the efficient replacement for the old mediator's fragile
// AsyncLocalStorage + WS-socket-monkey-patching "bridge". Credo 0.6.x emits
// DidCommMessageProcessed with BOTH the decoded message AND the raw outer
// `encryptedMessage`, so for a DIDComm v1 Forward we can read the outer JWE
// fingerprint (X, what the sender/controller transport saw) and the inner JWE
// fingerprint (Y, what the recipient/mobile will unpack) from a SINGLE event,
// synchronously, with no context propagation and no patching.
//
//   sender/controller transport ── X ──▶ mediator inbound (X)
//                                              │  forward.bridge { jwe_fp_in: X, jwe_fp_out: Y }
//                                              ▼
//                              mediator outbound / queue (Y) ── Y ──▶ recipient/mobile inbound (Y)
//
// The bridge line is the join: match X against the sender side, Y against the
// recipient side. No iv needs to be carried across async boundaries.

// Instrumentation-owned receive timestamps. Credo 0.6.0 does not populate
// `receivedAt` on DidCommMessageReceived / DidCommMessageProcessed for HTTP or
// WS inbound traffic, so we record it ourselves here.
//
// Keyed by the OUTER encrypted-message object, NOT the decrypted message: the
// two events carry different objects. DidCommMessageReceived.payload.message is
// the raw encrypted JWE that the inbound transport handed to the receiver, and
// that exact reference flows through (receiveMessage → InboundMessageContext →
// dispatcher) to DidCommMessageProcessed.payload.encryptedMessage. The decoded
// `message` on the processed event is a freshly-constructed DidCommMessage and
// would never match. WeakMap ensures entries are GC'd with the JWE object — no
// manual cleanup needed.
const receiveTimestamps = new WeakMap<object, number>()

export function wireEventInstrumentation(agent: MediatorAgent): void {
  // Capture receive time before the message handler chain runs. `payload.message`
  // here is the outer encrypted JWE — the same reference that surfaces as
  // `encryptedMessage` on DidCommMessageProcessed below.
  agent.events.on<DidCommMessageReceivedEvent>(DidCommEventTypes.DidCommMessageReceived, (event) => {
    try {
      if (event.payload.message && typeof event.payload.message === 'object') {
        receiveTimestamps.set(event.payload.message as object, Date.now())
      }
    } catch {
      // best-effort
    }
  })

  // Outer↔inner bridge: emitted once per forwarded message.
  //
  // `processing_ms` (inbound receivedAt → fully processed) is the in-mediator
  // handling time: decrypt + route + (for DirectDelivery) the synchronous send,
  // or the queue write. It is the direct signal for the "DirectDelivery is fast
  // with little data but slows under DB load / first request fast then
  // subsequent slow" observation — a storage/connection-pool bottleneck shows up
  // as this value climbing while inbound→outbound network time stays flat.
  agent.events.on<DidCommMessageProcessedEvent>(DidCommEventTypes.DidCommMessageProcessed, (event) => {
    try {
      const { message, encryptedMessage, connection } = event.payload
      if (!(message instanceof DidCommForwardMessage)) return

      // Look up by the outer encrypted message — the same object reference that
      // DidCommMessageReceived carried as `payload.message` (see WeakMap note).
      const receiveTs = encryptedMessage ? receiveTimestamps.get(encryptedMessage) : undefined

      emitStructured(LogLevel.info, {
        hop: 'mediator.forward.bridge',
        jwe_fp_in: encryptedMessage ? tryExtractJweFp(encryptedMessage) : '',
        jwe_fp_out: tryExtractJweFp(message.message),
        recipient_key_short: message.to ? truncateKey(message.to) : '',
        conn_id: connection?.id ?? '',
        processing_ms: receiveTs !== undefined ? Date.now() - receiveTs : undefined,
      })
    } catch {
      // best-effort — instrumentation must never disturb message processing
    }
  })

  // Outbound delivery outcome for messages the mediator sends via
  // DidCommMessageSender.sendMessage(outboundMessageContext) — i.e. the
  // mediator's OWN coordination traffic (mediation grants, keylist responses,
  // pickup status/delivery). `status` is SentToSession | SentToTransport |
  // QueuedForPickup | Undeliverable.
  //
  // NOTE: this does NOT cover forwarded user messages. The mediator forward
  // path routes via DidCommMessageSender.sendPackage() (DirectDelivery) or the
  // pickup queue, neither of which emits DidCommMessageSent. The forward
  // delivery outcome is instrumented directly instead:
  //   - strategy decision + undeliverable → InstrumentedMediatorService
  //   - live session delivery (SentToSession) → InstrumentedTransportService
  //   - queue write (QueuedForPickup)        → InstrumentedQueueTransportRepository
  //   - service-endpoint send (SentToTransport) → Instrumented*OutboundTransport
  agent.events.on<DidCommMessageSentEvent>(DidCommEventTypes.DidCommMessageSent, (event) => {
    try {
      const ctx = event.payload.message
      const threadId = (ctx.message as { threadId?: string } | undefined)?.threadId
      emitStructured(LogLevel.info, {
        hop: 'mediator.message.sent',
        status: event.payload.status,
        conn_id: ctx.connection?.id ?? '',
        message_type: ctx.message?.type,
        thread_id: threadId ?? '',
      })
    } catch {
      // best-effort
    }
  })

  // Live-mode pickup session lifecycle. The gap between a WS staying open
  // (mediator.ws.session.*) and the live session being removed here is the
  // direct signal for the "live session torn down by transient HTTP pickup
  // churn" hypothesis: a saved→removed pair while the WS is still open means a
  // message that could have been live-delivered fell back to slow queue pickup.
  agent.events.on<DidCommMessagePickupLiveSessionSavedEvent>(
    DidCommMessagePickupEventTypes.LiveSessionSaved,
    (event) => {
      const s = event.payload.session
      emitStructured(LogLevel.info, {
        hop: 'mediator.live.session.saved',
        flow: 'pickup',
        conn_id: s.connectionId,
        session_id: s.id,
        role: s.role,
        protocol_version: String(s.protocolVersion),
        transport_session_id: s.transportSessionId,
      })
    }
  )

  agent.events.on<MessagePickupLiveSessionRemovedEvent>(DidCommMessagePickupEventTypes.LiveSessionRemoved, (event) => {
    const s = event.payload.session
    emitStructured(LogLevel.info, {
      hop: 'mediator.live.session.removed',
      flow: 'pickup',
      conn_id: s.connectionId,
      session_id: s.id,
      role: s.role,
      protocol_version: String(s.protocolVersion),
      transport_session_id: s.transportSessionId,
    })
  })

  // Pickup completion carries the pickup-protocol thread id + connection.
  agent.events.on<MessagePickupCompletedEvent>(DidCommMessagePickupEventTypes.MessagePickupCompleted, (event) => {
    emitStructured(LogLevel.info, {
      hop: 'mediator.pickup.completed',
      flow: 'pickup',
      conn_id: event.payload.connection.id,
      thread_id: event.payload.threadId ?? '',
    })
  })
}
