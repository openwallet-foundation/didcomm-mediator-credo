import { MessagePickupRepository } from '@credo-ts/core'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PickupLoader, loadPickup } from '../loader'
import { PickupType } from '../type'

vi.mock('../../config')
vi.mock('../../logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
  })),
}))

// Mock PostgresPickupLoader
vi.mock('../postgresLoader', () => {
  return {
    PostgresPickupLoader: vi.fn().mockImplementation(() => ({
      load: vi.fn().mockReturnValueOnce({} as MessagePickupRepository),
    })),
  }
})

describe('loadPickup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('loads PostgresPickupLoader for valid type and strategy', async () => {
    await loadPickup(PickupType.Postgres, MessageForwardingStrategy.DirectDelivery)

    const { PostgresPickupLoader } = await import('../postgresLoader')
    expect(PostgresPickupLoader).toHaveBeenCalledTimes(1)
  })

  it('throws error for unsupported pickup type', async () => {
    await expect(loadPickup('unknown-type' as PickupType, MessageForwardingStrategy.DirectDelivery)).rejects.toThrow(
      /Unsupported pickup type/
    )
  })

  it('throws error for invalid forwarding strategy', async () => {
    await expect(loadPickup(PickupType.Postgres, 'invalid-strategy' as MessageForwardingStrategy)).rejects.toThrow(
      /Invalid pickup forwarding strategy/
    )
  })

  it('is case insensitive when matching pickup type', async () => {
    await loadPickup('POSTGRES' as PickupType, MessageForwardingStrategy.DirectDelivery)
    const { PostgresPickupLoader } = await import('../postgresLoader')
    expect(PostgresPickupLoader).toHaveBeenCalledTimes(1)
  })
})

describe('PickupLoader abstract class', () => {
  it('can be extended with a custom loader', async () => {
    class DummyLoader extends PickupLoader {
      async load() {
        return undefined
      }
    }

    const loader = new DummyLoader({ postgresHost: 'host' })
    expect(loader.pickupConfig.postgresHost).toBe('host')
  })
})
