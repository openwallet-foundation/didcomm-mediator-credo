import {
  type AgentContext,
  EventEmitter,
  InjectionSymbols,
  inject,
  injectable,
  Repository,
  type StorageService,
} from '@credo-ts/core'

import { MessageRecord } from './MessageRecord.js'

@injectable()
export class MessageRepository extends Repository<MessageRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService)
    storageService: StorageService<MessageRecord>,
    eventEmitter: EventEmitter
  ) {
    super(MessageRecord, storageService, eventEmitter)
  }

  public findByConnectionId(agentContext: AgentContext, connectionId: string) {
    return this.findByQuery(agentContext, { connectionId })
  }

  // Aggregate queue-depth stats for the 10s gauge snapshot. Only used by the
  // in-tree `credo` pickup backend (debug instrumentation, best-effort).
  public async getQueueStats(agentContext: AgentContext): Promise<{
    total: number
    oldestAgeMs: number
    top10: Array<{ connId: string; count: number }>
  }> {
    const records = await this.getAll(agentContext)

    let oldest = Date.now()
    const connCounts: Record<string, number> = {}

    for (const record of records) {
      if (record.createdAt.getTime() < oldest) oldest = record.createdAt.getTime()
      const connId = record.connectionId ?? 'unknown'
      connCounts[connId] = (connCounts[connId] ?? 0) + 1
    }

    const top10 = Object.entries(connCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([connId, count]) => ({ connId, count }))

    return {
      total: records.length,
      oldestAgeMs: records.length > 0 ? Date.now() - oldest : 0,
      top10,
    }
  }
}
