import {
  DidCommMessagePickupEventTypes,
  DidCommMessagePickupLiveSessionSavedEvent,
  MessagePickupLiveSessionRemovedEvent,
} from '@credo-ts/didcomm'
import Redis from 'ioredis'
import type { MediatorAgent } from '../../agent'

export interface StreamMessagePayload {
  connectionId: string
}

export interface StreamMessage {
  id: string
  payload: StreamMessagePayload
}

export type StreamKey = `server:${string}:message-publishing`

export class RedisStreamMessagePublishing {
  private consumerGroup = 'default'
  private consumerName = `${this.serverId}-consumer`

  constructor(
    agent: MediatorAgent,
    private client: Redis,
    public readonly serverId: string
  ) {
    // Register event handlers
    agent.events.on(
      DidCommMessagePickupEventTypes.LiveSessionRemoved,
      async (event: MessagePickupLiveSessionRemovedEvent) => {
        const connectionId = event.payload.session.connectionId
        agent.context.config.logger.info(`*** Session removed for connectionId: ${connectionId} ***`)

        try {
          await this.unregisterConnection(connectionId)
        } catch (handlerError) {
          agent.context.config.logger.error(`Error handling LiveSessionRemoved: ${handlerError}`)
        }
      }
    )

    agent.events.on(
      DidCommMessagePickupEventTypes.LiveSessionSaved,
      async (event: DidCommMessagePickupLiveSessionSavedEvent) => {
        const connectionId = event.payload.session.connectionId
        agent.context.config.logger.info(`*** Session saved for connectionId: ${connectionId} ***`)

        try {
          this.registerConnection(connectionId)
        } catch (handlerError) {
          agent.context.config.logger.error(`Error handling LiveSessionSaved: ${handlerError}`)
        }
      }
    )
  }

  /**
   * Register a connection to this server instance
   */
  public async registerConnection(connectionId: string): Promise<void> {
    await this.client.setex(`connection:${connectionId}`, 3600, this.serverId)
  }

  /**
   * Unregister a connection from this server instance
   */
  public async unregisterConnection(connectionId: string): Promise<void> {
    await this.client.del(`connection:${connectionId}`)
  }

  /**
   * Get the server ID for a specific connection
   */
  public async getConnectionServer(connectionId: string): Promise<string | null> {
    return await this.client.get(`connection:${connectionId}`)
  }

  private getStreamKey = (targetServerId: string): StreamKey => `server:${targetServerId}:message-publishing` as const
  private getServerIdFromStreamKey = (streamKey: StreamKey): string => streamKey.split(':')[1]

  /**
   * Send a message to a specific server's stream
   */
  public async sendMessageToServer(targetServerId: string, data: StreamMessagePayload): Promise<void> {
    const streamKey = this.getStreamKey(targetServerId)
    await this.client.xadd(streamKey, '*', 'message', JSON.stringify(data))
  }

  /**
   * Continuously listen for and process messages on this server's stream
   */
  public async listenForMessages(
    handler: (message: StreamMessage) => Promise<void>,
    { batchSize = 10, blockMs = 1000, signal }: { batchSize?: number; blockMs?: number; signal?: AbortSignal } = {}
  ): Promise<void> {
    const streamKey = this.getStreamKey(this.serverId)
    await this.ensureConsumerGroup(streamKey)

    while (!signal?.aborted) {
      try {
        const response = await this.client.xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerName,
          'COUNT',
          batchSize,
          'BLOCK',
          blockMs,
          'STREAMS',
          streamKey,
          '>'
        )

        if (!response) {
          continue
        }

        const messages = this.parseStreamMessages(response)
        for (const message of messages) {
          try {
            await handler(message)
            await this.acknowledgeMessage(streamKey, message.id)
          } catch (error) {
            console.error(`Error processing message ${message.id}:`, error)
          }
        }
      } catch (error) {
        console.error('Error reading from stream', error)
      }
    }
  }

  /**
   * Initialize the consumer group for a stream
   */
  private async ensureConsumerGroup(streamKey: string): Promise<void> {
    try {
      await this.client.xgroup('CREATE', streamKey, this.consumerGroup, '0', 'MKSTREAM')
    } catch (error) {
      // Group already exists
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        return
      }

      throw error
    }
  }

  /**
   * Parse ioredis stream response into structured format
   */
  private parseStreamMessages(response: unknown[]): StreamMessage[] {
    if (!response || response.length === 0) return []

    const messages: StreamMessage[] = []

    for (const responseItem of response) {
      if (
        !responseItem ||
        !Array.isArray(responseItem) ||
        typeof responseItem[0] !== 'string' ||
        !Array.isArray(responseItem[1])
      ) {
        console.error('Received invalid stream message, ignoring.', {
          responseItem,
        })
        continue
      }

      const responseMessages = responseItem[1]
      for (const responseMessage of responseMessages) {
        if (
          !Array.isArray(responseMessage) ||
          // ID
          typeof responseMessage[0] !== 'string' ||
          !Array.isArray(responseMessage[1]) ||
          responseMessage[1][0] !== 'message' ||
          typeof responseMessage[1][1] !== 'string'
        ) {
          console.error('Received invalid stream message, ignoring.', {
            responseMessages,
          })
          continue
        }

        let streamMessage: StreamMessage
        try {
          streamMessage = {
            id: responseMessage[0],
            payload: JSON.parse(responseMessage[1][1]),
          }
        } catch (error) {
          console.error('Error parsing stream message as JSON, ignoring.', {
            responseItem,
          })
          continue
        }

        messages.push(streamMessage)
      }
    }

    return messages
  }

  /**
   * Acknowledge a message
   */
  private async acknowledgeMessage(streamKey: string, messageId: string): Promise<void> {
    await this.client.xack(streamKey, this.consumerGroup, messageId)
  }

  /**
   * Get all active server streams
   */
  private async getOtherServerStreams() {
    const allStreamsKey = this.getStreamKey('*')
    const thisServerStreamKey = this.getStreamKey(this.serverId)
    const keys = await this.client.keys(allStreamsKey)
    return keys.filter((key): key is `server:${string}:message-publishing` => key !== thisServerStreamKey)
  }

  /**
   * Claim and process pending messages from other server streams
   */
  private async _claimPendingMessages(
    handler: (serverId: string, message: StreamMessage) => Promise<void>,
    { minIdleTimeMs = 60000, batchSize = 10 }
  ): Promise<void> {
    const otherServerStreams = await this.getOtherServerStreams()

    for (const streamKey of otherServerStreams) {
      try {
        const pendingCount = await this.getPendingCount(streamKey)
        if (pendingCount === 0) continue

        const claimedResponse = await this.client.xautoclaim(
          streamKey,
          this.consumerGroup,
          this.consumerName,
          minIdleTimeMs,
          '0-0',
          'COUNT',
          batchSize
        )

        const claimedMessages = this.parseStreamMessages([claimedResponse])
        for (const message of claimedMessages) {
          try {
            await handler(this.getServerIdFromStreamKey(streamKey), message)
            await this.acknowledgeMessage(streamKey, message.id)
          } catch (error) {
            console.error(`Error processing claimed message ${message.id} from ${streamKey}:`, error)
          }
        }
      } catch (error) {
        console.error(`Error claiming from stream ${streamKey}:`, error)
      }
    }
  }

  /**
   * Continuously claim pending messages from other streams.
   *
   * You can provide an `AbortSignal` to allow cancellation
   */
  public async claimPendingMessages(
    handler: (serverId: string, message: StreamMessage) => Promise<void>,
    {
      intervalMs = 15000,
      minIdleTimeMs = 60000,
      signal,
    }: { signal?: AbortSignal; intervalMs?: number; minIdleTimeMs?: number } = {}
  ): Promise<void> {
    while (!signal?.aborted) {
      try {
        await this._claimPendingMessages(handler, { minIdleTimeMs })
      } catch {
        // no-op, we keep trying.
        // We should maybe add a backoff or something in this case
      }

      // Abortable sleep
      await this.abortableSleep(intervalMs, signal)
    }
  }

  /**
   * Get pending message count for a stream
   */
  public async getPendingCount(streamKey: string): Promise<number> {
    try {
      await this.ensureConsumerGroup(streamKey)
      const pending = await this.client.xpending(streamKey, this.consumerGroup)

      if (!pending || !Array.isArray(pending) || typeof pending[0] !== 'number') {
        return 0
      }

      return pending[0]
    } catch (error) {
      return 0
    }
  }

  private async abortableSleep(intervalMs: number, signal?: AbortSignal) {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, intervalMs)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout)
            reject(new DOMException('Aborted', 'AbortError'))
          },
          { once: true }
        )
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      throw error
    }
  }
}
