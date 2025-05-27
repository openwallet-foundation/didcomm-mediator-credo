import { Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgresMessagePickupRepository } from '../../../../../packages/message-pickup-repository-pg/src/PostgresMessagePickupRepository'
import config from '../../config'
import { PostgresPickupLoader } from '../postgresLoader'

vi.mock('../../config')
vi.mock('../../database', () => ({
  askarPostgresConfig: {
    config: {
      host: 'base-postgres-host',
    },
  },
}))
vi.mock('../../../../../packages/message-pickup-repository-pg/src/PostgresMessagePickupRepository')

describe('PostgresPickupLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return base DB config when useBaseConnection is true', () => {
    ;(config.get as Mock).mockImplementation((...args: any[]) => {
      const mockValues: Record<string, any> = {
        'agent:pickup': {
          settings: JSON.stringify({ useBaseConnection: true, "postgresDatabaseName": 'not-the-base-db' }),
        },
        'db:host': 'base-postgres-host',
        'db:user': 'base-user',
        'db:password': 'base-pass',
        'db:databaseName': 'base-db',
        'agent:logLevel': 'info',
      }
      return mockValues[args[0]]
    })

    const loader = new PostgresPickupLoader()
    const configResult = loader.getDatabaseConfig()

    expect(configResult).toEqual({
      host: 'base-postgres-host',
      user: 'base-user',
      password: 'base-pass',
      databaseName: 'not-the-base-db',
    })
  })

  it('should throw if useBaseConnection is true but not using postgres', () => {
    ;(config.get as Mock).mockImplementation((...args: any[]) => {
      const mockValues: Record<string, any> = {
        'agent:pickup': {
          settings: JSON.stringify({ useBaseConnection: true }),
        },
        'db:host': undefined,
        'agent:logLevel': 'info',
      }
      return mockValues[args[0]]
    })

    const loader = new PostgresPickupLoader()
    expect(() => loader.getDatabaseConfig()).toThrow(
      `Agent is configured to use base connection, but agent isn't using postgres.`
    )
  })

  it('should return pickup config when useBaseConnection is false', () => {
    ;(config.get as Mock).mockImplementation((...args: any[]) => {
      const mockValues: Record<string, any> = {
        'agent:pickup': {
          settings: JSON.stringify({
            useBaseConnection: false,
            postgresHost: 'custom-host',
            postgresUser: 'custom-user',
            postgresPassword: 'custom-pass',
            postgresDatabaseName: 'custom-db',
          }),
        },
        'agent:logLevel': 'info',
      }
      return mockValues[args[0]]
    })

    const loader = new PostgresPickupLoader()
    const configResult = loader.getDatabaseConfig()

    expect(configResult).toEqual({
      host: 'custom-host',
      user: 'custom-user',
      password: 'custom-pass',
      databaseName: 'custom-db',
    })
  })

  it('should throw if required pickup config is missing', () => {
    ;(config.get as Mock).mockImplementation((...args: any[]) => {
      const mockValues: Record<string, any> = {
        'agent:pickup': {
          settings: JSON.stringify({
            useBaseConnection: false,
          }),
        },
        'agent:logLevel': 'info',
      }
      return mockValues[args[0]]
    })

    const loader = new PostgresPickupLoader()
    expect(() => loader.getDatabaseConfig()).toThrow(
      'Postgres pickup configuration is incomplete. Please provide postgresHost, postgresUser, and postgresPassword.'
    )
  })

  it('should call PostgresMessagePickupRepository with correct config in load()', async () => {
    ;(config.get as Mock).mockImplementation((...args: any[]) => {
      const mockValues: Record<string, any> = {
        'agent:pickup': {
          settings: JSON.stringify({
            useBaseConnection: false,
            postgresHost: 'host',
            postgresUser: 'user',
            postgresPassword: 'pass',
            postgresDatabaseName: 'db',
          }),
        },
        'agent:logLevel': 'info',
      }
      return mockValues[args[0]]
    })

    const loader = new PostgresPickupLoader()
    await loader.load()

    expect(PostgresMessagePickupRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        postgresHost: 'host',
        postgresUser: 'user',
        postgresPassword: 'pass',
        postgresDatabaseName: 'db',
        logger: expect.anything(),
      })
    )
  })
})
