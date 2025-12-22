import { EventEmitter, InjectionSymbols, inject, injectable, Repository, type StorageService } from '@credo-ts/core'

import { DidCommPushNotificationsFcmRecord } from './DidCommPushNotificationsFcmRecord.js'

@injectable()
export class DidCommPushNotificationsFcmRepository extends Repository<DidCommPushNotificationsFcmRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<DidCommPushNotificationsFcmRecord>,
    eventEmitter: EventEmitter
  ) {
    super(DidCommPushNotificationsFcmRecord, storageService, eventEmitter)
  }
}
