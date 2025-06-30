import { describe, expect, it } from 'vitest'

import { PostgresMessagePickupRepository } from '@credo-ts/didcomm-message-pickup-postgres'

describe('loadMessagePickupStorage', () => {
  it('returns PostgresMessagePickupRepository for postgres message pickup storage', async () => {
    process.env = {
      LOG_LEVEL: 'off',
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
      messagePickup__storage__type: 'postgres',
      messagePickup__storage__host: 'postgres',
      messagePickup__storage__user: 'postgres',
      messagePickup__storage__password: 'postgres',
      messagePickup__storage__database: 'postgres',
    }
    const { loadMessagePickupStorage } = await import('../config/messagePickupLoader')
    const messagePickupStorage = await loadMessagePickupStorage()

    expect(messagePickupStorage).toBeInstanceOf(PostgresMessagePickupRepository)
  })
})
