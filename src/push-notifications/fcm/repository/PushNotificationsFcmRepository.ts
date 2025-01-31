import { EventEmitter, InjectionSymbols, Repository, type StorageService, inject, injectable } from '@credo-ts/core'

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
