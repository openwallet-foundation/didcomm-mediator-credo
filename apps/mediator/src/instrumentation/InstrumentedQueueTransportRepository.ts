import type { Agent, AgentContext } from '@credo-ts/core'
import { LogLevel } from '@credo-ts/core'
import type {
  AddMessageOptions,
  GetAvailableMessageCountOptions,
  QueuedDidCommMessage,
  RemoveMessagesOptions,
  TakeFromQueueOptions,
} from '@credo-ts/didcomm'

import type { ExtendedQueueTransportRepository } from '../config/messagePickupLoader.js'
import { durationMs, emitStructured, makeSpanId, monoNow, tryExtractJweFp } from '../logger/StructuredLogger.js'
import { recordQueueWrite } from './metrics.js'

// Wraps ANY DidCommQueueTransportRepository (the in-tree `credo` queue, or the
// `postgres` / `dynamodb` backends) and emits the queue-side instrumentation
// hops. Decorating the repository here — rather than editing each backend —
// means every pickup-storage type is covered uniformly, and the external
// backend packages stay untouched (umbrella convention: instrument in the
// consuming repo, not in `@credo-ts/*`).
export class InstrumentedQueueTransportRepository implements ExtendedQueueTransportRepository {
  public constructor(private readonly inner: ExtendedQueueTransportRepository) {}

  public initialize(agent: Agent): Promise<void> {
    return this.inner.initialize?.(agent) ?? Promise.resolve()
  }

  public getAvailableMessageCount(
    agentContext: AgentContext,
    options: GetAvailableMessageCountOptions
  ): number | Promise<number> {
    return this.inner.getAvailableMessageCount(agentContext, options)
  }

  public removeMessages(agentContext: AgentContext, options: RemoveMessagesOptions): void | Promise<void> {
    return this.inner.removeMessages(agentContext, options)
  }

  public async takeFromQueue(
    agentContext: AgentContext,
    options: TakeFromQueueOptions
  ): Promise<QueuedDidCommMessage[]> {
    const { connectionId, limit } = options
    const spanId = makeSpanId()
    const startMono = monoNow()

    emitStructured(LogLevel.info, {
      hop: 'mediator.pickup.batch.dispatch.start',
      flow: 'pickup',
      span_id: spanId,
      conn_id: connectionId,
      pickup_limit: limit,
    })

    const messages = await this.inner.takeFromQueue(agentContext, options)

    // Per-message inner-JWE fingerprints, so the analyst can join a dispatch
    // event back to the queue write that produced each message.
    const dispatchedFingerprints = messages.map((m) => tryExtractJweFp(m.encryptedMessage)).filter(Boolean)

    emitStructured(LogLevel.info, {
      hop: 'mediator.pickup.batch.dispatch.end',
      flow: 'pickup',
      span_id: spanId,
      conn_id: connectionId,
      duration_ms: durationMs(startMono),
      message_count: messages.length,
      delete_messages: options.deleteMessages ?? false,
      dispatched_jwe_fps: dispatchedFingerprints,
    })

    return messages
  }

  public async addMessage(agentContext: AgentContext, options: AddMessageOptions): Promise<string> {
    const { connectionId, payload } = options

    // jwe_fp_out: inner JWE fingerprint — the payload being queued, which the
    // mobile wallet will unpack. Joins to the recipient's inbound and, via the
    // mediator.forward.bridge line, back to the outer iv the sender transport saw.
    const jweFpOut = tryExtractJweFp(payload)

    emitStructured(LogLevel.info, {
      hop: 'mediator.forward.strategy.decision',
      conn_id: connectionId,
      jwe_fp_out: jweFpOut,
      decision: 'queue',
    })

    const spanId = makeSpanId()
    const startMono = monoNow()
    emitStructured(LogLevel.info, {
      hop: 'mediator.queue.write.start',
      span_id: spanId,
      conn_id: connectionId,
      jwe_fp_out: jweFpOut,
    })

    const id = await this.inner.addMessage(agentContext, options)

    recordQueueWrite()
    emitStructured(LogLevel.info, {
      hop: 'mediator.queue.write.end',
      span_id: spanId,
      conn_id: connectionId,
      jwe_fp_out: jweFpOut,
      duration_ms: durationMs(startMono),
    })

    // Per-connection queue depth after the write — fire-and-forget so the
    // count never blocks the delivery path. Works for every backend (standard
    // repository method), unlike the aggregate gauge.
    void Promise.resolve(this.inner.getAvailableMessageCount(agentContext, { connectionId }))
      .then((queueDepth) => {
        emitStructured(LogLevel.info, {
          hop: 'mediator.queue.depth.sample',
          conn_id: connectionId,
          queue_depth_after: queueDepth,
        })
      })
      .catch(() => {
        // best-effort
      })

    return id
  }
}
