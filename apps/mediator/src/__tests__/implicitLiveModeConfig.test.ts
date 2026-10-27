import { beforeEach, describe, expect, it, vi } from 'vitest'

const baseEnv = {
  LOG_LEVEL: 'off',
  ASKAR__STORE_ID: 'test',
  ASKAR__STORE_KEY: 'test',
  MESSAGE_PICKUP__STORAGE__TYPE: 'postgres',
  MESSAGE_PICKUP__STORAGE__HOST: 'postgres',
  MESSAGE_PICKUP__STORAGE__USER: 'postgres',
  MESSAGE_PICKUP__STORAGE__PASSWORD: 'postgres',
  MESSAGE_PICKUP__STORAGE__DATABASE: 'postgres',
  MESSAGE_PICKUP__IMPLICIT_LIVE_MODE: 'true',
}

describe('messagePickup.implicitLiveMode config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('is enabled with postgres storage and QueueAndLiveModeDelivery', async () => {
    process.env = { ...baseEnv, MESSAGE_PICKUP__FORWARDING_STRATEGY: 'QueueAndLiveModeDelivery' }
    const { config } = await import('../config.js')

    expect(config.messagePickup.implicitLiveMode).toBe(true)
  })

  it('is rejected with any other forwarding strategy', async () => {
    process.env = { ...baseEnv, MESSAGE_PICKUP__FORWARDING_STRATEGY: 'QueueOnly' }

    await expect(import('../config.js')).rejects.toThrow(/implicit live mode requires/)
  })

  it('is disabled by default', async () => {
    process.env = { ...baseEnv, MESSAGE_PICKUP__IMPLICIT_LIVE_MODE: undefined }
    const { config } = await import('../config.js')

    expect(config.messagePickup.implicitLiveMode).toBe(false)
  })
})
