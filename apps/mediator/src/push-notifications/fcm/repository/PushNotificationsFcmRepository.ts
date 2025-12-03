import { EventEmitter, InjectionSymbols, inject, injectable, Repository, type StorageService } from '@credo-ts/core'

import { PushNotificationsFcmRecord } from './PushNotificationsFcmRecord'

@injectable()
export class PushNotificationsFcmRepository extends Repository<PushNotificationsFcmRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<PushNotificationsFcmRecord>,
    eventEmitter: EventEmitter
  ) {
    super(PushNotificationsFcmRecord, storageService, eventEmitter)
  }
}
