import { BaseEvent, Logger } from '@credo-ts/core'
import { DidCommEncryptedMessage, DidCommMessagePickupSession } from '@credo-ts/didcomm'

export interface PostgresTransportQueuePostgresConfig {
  logger?: Logger
  postgresUser: string
  postgresPassword: string
  postgresHost: string
  postgresDatabaseName?: string

  /**
   * How often this instance refreshes its presence in the `instance` table.
   * Defaults to 10_000ms.
   */
  heartbeatIntervalMs?: number

  /**
   * After how long without a heartbeat an instance is considered dead and
   * its `live_session` rows become eligible for reaping. Defaults to 60_000ms.
   * Should be comfortably larger than `heartbeatIntervalMs` (typically 5-10x)
   * to tolerate transient DB or scheduling latency.
   */
  instanceTimeoutMs?: number

  /**
   * How often to run the stale-instance reaper. Only one instance runs the
   * reaper per tick (protected by a Postgres advisory lock). Defaults to 30_000ms.
   */
  reaperIntervalMs?: number

  /**
   * How long a message can stay in `sending` without being acknowledged before the
   * reaper moves it back to `pending`. Defaults to 60_000ms.
   */
  ackTimeoutMs?: number
}

export const PostgresMessageQueuedEventType = 'TransportQueuePostgresMessageQueued' as const

export interface PostgresMessageQueuedEvent extends BaseEvent {
  type: typeof PostgresMessageQueuedEventType
  payload: {
    message: {
      id: string
      connectionId: string
      recipientDids: string[]
      encryptedMessage: DidCommEncryptedMessage
      receivedAt: Date
      state: 'pending' | 'sending'
    }
    session?: DidCommMessagePickupSession
  }
}

export const PostgresMessagesPendingEventType = 'TransportQueuePostgresMessagesPending' as const

/**
 * Emitted when messages for a connection went back to `pending` with no live delivery in progress.
 */
export interface PostgresMessagesPendingEvent extends BaseEvent {
  type: typeof PostgresMessagesPendingEventType
  payload: {
    connectionId: string
  }
}

export interface ExtendedMessagePickupSession extends DidCommMessagePickupSession {
  isLocalSession: boolean
}
