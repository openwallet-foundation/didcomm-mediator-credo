import { describe, expect, it } from 'vitest'

import { buildCredoMediatorPrunerOptionsFromEnv, parsePickupRepositoryUrl } from '../src/main.js'

describe('buildCredoMediatorPrunerOptionsFromEnv', () => {
  it('builds pruner options from environment variables', () => {
    const options = buildCredoMediatorPrunerOptionsFromEnv({
      WALLET_URI: 'sqlite:///wallet.db',
      PICKUP_REPOSITORY_URL: 'postgres://user:pass@localhost:5432/db',
      WALLET_KEY: 'secret',
      WALLET_KEY_DERIVATION_METHOD: 'ARGON2I_MOD',
      INACTIVE_DAYS_THRESHOLD: '14',
    })

    expect(options.walletKey).toBe('secret')
    expect(options.walletKeyDerivationMethod).toBe('ARGON2I_MOD')
    expect(options.inactiveDaysThreshold).toBe(14)
    expect(options.conn.uri).toBe('sqlite:///wallet.db')
    expect(options.pickupRepoConn.connectionString).toBe('postgres://user:pass@localhost:5432/db')
  })

  it('accepts DATABASE_URL as an alias for PICKUP_REPOSITORY_URL', () => {
    const options = buildCredoMediatorPrunerOptionsFromEnv({
      WALLET_URI: 'sqlite:///wallet.db',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      WALLET_KEY: 'secret',
    })

    expect(options.pickupRepoConn.connectionString).toBe('postgres://user:pass@localhost:5432/db')
  })

  it('accepts POSTGRES_URL as an alias for PICKUP_REPOSITORY_URL', () => {
    const options = buildCredoMediatorPrunerOptionsFromEnv({
      WALLET_URI: 'sqlite:///wallet.db',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/db',
      WALLET_KEY: 'secret',
    })

    expect(options.pickupRepoConn.connectionString).toBe('postgres://user:pass@localhost:5432/db')
  })

  it('throws when required environment variables are missing', () => {
    expect(() => buildCredoMediatorPrunerOptionsFromEnv({})).toThrow(/Missing required environment variable/)
  })

  it('throws when INACTIVE_DAYS_THRESHOLD is not numeric', () => {
    expect(() =>
      buildCredoMediatorPrunerOptionsFromEnv({
        WALLET_URI: 'sqlite:///wallet.db',
        PICKUP_REPOSITORY_URL: 'postgres://user:pass@localhost:5432/db',
        WALLET_KEY: 'secret',
        INACTIVE_DAYS_THRESHOLD: 'abc',
      })
    ).toThrow(/INACTIVE_DAYS_THRESHOLD/)
  })
})

describe('parsePickupRepositoryUrl', () => {
  it('throws for an invalid URL', () => {
    expect(() => parsePickupRepositoryUrl('not-a-url')).toThrow(/valid postgres connection URL/)
  })

  it('throws for a non-postgres protocol', () => {
    expect(() => parsePickupRepositoryUrl('mysql://user:pass@localhost:3306/db')).toThrow(
      /postgres: or postgresql: protocol/
    )
  })

  it('preserves query-string options in the connection string', () => {
    const connection = parsePickupRepositoryUrl(
      'postgres://user:pass@localhost:5432/db?sslmode=require&application_name=cleanup'
    )

    expect(connection.connectionString).toBe(
      'postgres://user:pass@localhost:5432/db?sslmode=require&application_name=cleanup'
    )
  })
})
