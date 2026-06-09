import { LogLevel } from '@credo-ts/core'
import {
  DidCommEventTypes,
  DidCommForwardMessage,
  DidCommMessagePickupEventTypes,
  type DidCommMessagePickupLiveSessionSavedEvent,
  type DidCommMessageProcessedEvent,
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
export function wireEventInstrumentation(agent: MediatorAgent): void {
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
      const { message, encryptedMessage, connection, receivedAt } = event.payload
      if (!(message instanceof DidCommForwardMessage)) return

      emitStructured(LogLevel.info, {
        hop: 'mediator.forward.bridge',
        jwe_fp_in: encryptedMessage ? tryExtractJweFp(encryptedMessage) : '',
        jwe_fp_out: tryExtractJweFp(message.message),
        recipient_key_short: message.to ? truncateKey(message.to) : '',
        conn_id: connection?.id ?? '',
        processing_ms: receivedAt ? Date.now() - receivedAt.getTime() : undefined,
      })
    } catch {
      // best-effort — instrumentation must never disturb message processing
    }
  })

  // Outbound delivery outcome. `status` is one of SentToSession |
  // SentToTransport | QueuedForPickup | Undeliverable. This is the direct signal
  // for the "DirectDelivery new connection fails on first try, works on second"
  // observation: with DirectDelivery there is no queue fallback, so a message
  // sent before the recipient's inbound (WS) transport session exists comes back
  // `Undeliverable`. A sustained share of Undeliverable / a live:queue ratio
  // shifting toward QueuedForPickup over time both surface here.
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
