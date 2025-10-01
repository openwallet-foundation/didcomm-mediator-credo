import { describe, expect, it } from 'vitest'

import { PostgresMessagePickupRepository } from '@credo-ts/didcomm-message-pickup-postgres'

describe('loadMessagePickupStorage', () => {
  it('returns PostgresMessagePickupRepository for postgres message pickup storage', async () => {
    process.env = {
      LOG_LEVEL: 'off',
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
      MESSAGE_PICKUP__STORAGE__TYPE: 'postgres',
      MESSAGE_PICKUP__STORAGE__HOST: 'postgres',
      MESSAGE_PICKUP__STORAGE__USER: 'postgres',
      MESSAGE_PICKUP__STORAGE__PASSWORD: 'postgres',
      MESSAGE_PICKUP__STORAGE__DATABASE: 'postgres',
    }
    const { loadMessagePickupStorage } = await import('../config/messagePickupLoader.js')
    const messagePickupStorage = await loadMessagePickupStorage()

    expect(messagePickupStorage).toBeInstanceOf(PostgresMessagePickupRepository)
  })
})
