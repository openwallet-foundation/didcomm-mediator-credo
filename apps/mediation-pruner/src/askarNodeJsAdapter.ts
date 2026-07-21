import { type EntryObject, KdfMethod, type Session, Store, StoreKeyMethod, askarNodeJS, ScanHandle } from '@openwallet-foundation/askar-nodejs'

import type { AskarRecord, AskarSession, AskarStore, AskarStoreFactory } from './credoMediatorPruner.js'

export function createAskarNodeJsStoreFactory(): AskarStoreFactory {
  return {
    async open({ uri, passKey, keyMethod }): Promise<AskarStore> {
      const store = await Store.open({
        uri,
        passKey,
        keyMethod: toStoreKeyMethod(keyMethod),
      })

      return {
        async fetchAll(
          category: string,
          options?: { tagFilter?: Record<string, string>; limit?: number }
        ): Promise<AskarRecord[]> {
          const session = await store.session().open()

          try {
            const entries = await session.fetchAll({
              category,
              tagFilter: options?.tagFilter,
              limit: options?.limit,
              isJson: true,
            })

            return mapEntries(entries)
          } finally {
            if (session.handle) {
              await session.close()
            }
          }
        },
        async scanStart(
          category: string,
          options?: { tagFilter?: Record<string, string>; offset?: number; limit?: number }
        ): Promise<ScanHandle> {
          const scanHandle = await askarNodeJS.scanStart({
            storeHandle: store.handle,
            category,
            tagFilter: options?.tagFilter,
            offset: options?.offset,
            limit: options?.limit,
          })
          return scanHandle
        },
        async scanNext(scanHandle: ScanHandle): Promise<AskarRecord[] | null> {
          const entryList = await askarNodeJS.scanNext({
            scanHandle,
          })
          if (!entryList) return null
          
          const entries: EntryObject[] = []
          const count = askarNodeJS.entryListCount({ entryListHandle: entryList })
          for (let i = 0; i < count; i++) {
            entries.push({
              category: askarNodeJS.entryListGetCategory({ entryListHandle: entryList, index: i }),
              name: askarNodeJS.entryListGetName({ entryListHandle: entryList, index: i }),
              value: JSON.parse(
                new TextDecoder().decode(
                  askarNodeJS.entryListGetValue({ entryListHandle: entryList, index: i })
                )
              ),
              tags: askarNodeJS.entryListGetTags({ entryListHandle: entryList, index: i }),
            } as unknown as EntryObject)
          }
          askarNodeJS.entryListFree({ entryListHandle: entryList })
          
          return mapEntries(entries)
        },
        scanFree(scanHandle: ScanHandle): void {
          scanHandle.free()
        },
        async withSession<T>(callback: (session: AskarSession) => Promise<T>): Promise<T> {
          const session = await store.session().open()

          try {
            const askarSession = new NodeJsAskarSession(session)
            return await callback(askarSession)
          } finally {
            if (session.handle) {
              await session.close()
            }
          }
        },
        async close(): Promise<void> {
          await store.close()
        },
        async count(category: string, tagFilter?: Record<string, string>): Promise<number> {
          const session = await store.session().open()

          try {
            return await session.count({ category, tagFilter })
          } finally {
            if (session.handle) {
              await session.close()
            }
          }
        },
      }
    },
  }
}

class NodeJsAskarSession implements AskarSession {
  public constructor(protected readonly session: Pick<Session, 'fetchAll' | 'remove' | 'replace' | 'count'>) {}

  public async fetchAll(
    category: string,
    options?: { tagFilter?: Record<string, string>; limit?: number }
  ): Promise<AskarRecord[]> {
    const entries = await this.session.fetchAll({
      category,
      tagFilter: options?.tagFilter,
      limit: options?.limit,
      isJson: true,
    })

    return mapEntries(entries)
  }

  public async remove(category: string, name: string): Promise<void> {
    await this.session.remove({ category, name })
  }

  public async replace(options: {
    category: string
    name: string
    valueJson: Record<string, unknown>
    tags?: Record<string, string> | null
  }): Promise<void> {
    await this.session.replace({
      category: options.category,
      name: options.name,
      value: options.valueJson,
      tags: options.tags ?? undefined,
    })
  }
}

function mapEntries(entries: EntryObject[]): AskarRecord[] {
  return entries.map((entry) => ({
    name: entry.name,
    valueJson: asRecord(entry.value),
    tags: normalizeTags(entry.tags),
  }))
}

export function toStoreKeyMethod(value?: string): StoreKeyMethod | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case 'RAW':
      return new StoreKeyMethod(KdfMethod.Raw)
    case 'NONE':
      return new StoreKeyMethod(KdfMethod.None)
    case 'ARGON2I_INT':
    case 'KDF:ARGON2I:INT':
      return new StoreKeyMethod(KdfMethod.Argon2IInt)
    case 'ARGON2I_MOD':
    case 'KDF:ARGON2I:MOD':
      return new StoreKeyMethod(KdfMethod.Argon2IMod)
    default:
      throw new Error(`Unsupported wallet key derivation method: ${value}`)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  throw new Error('Expected JSON object entry value from Askar session')
}

function normalizeTags(value: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, entryValue]) => [key, String(entryValue)]))
}
