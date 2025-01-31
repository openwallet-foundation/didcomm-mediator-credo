import {
  type AgentContext,
  EventEmitter,
  InjectionSymbols,
  Repository,
  type StorageService,
  inject,
  injectable,
} from '@credo-ts/core'

import { MessageRecord } from './MessageRecord'

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
}
