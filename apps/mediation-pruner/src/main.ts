import { fileURLToPath } from 'node:url'

import { createAskarNodeJsStoreFactory } from './askarNodeJsAdapter.js'
import {
  CredoMediatorPruner,
  type CredoMediatorPrunerOptions,
  type PickupRepositoryConnection,
  type WalletConnection,
} from './credoMediatorPruner.js'

export function buildCredoMediatorPrunerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): CredoMediatorPrunerOptions {
  const walletUri = requireEnv(env, 'WALLET_URI')
  const pickupRepositoryUrl = requireAnyEnv(env, ['PICKUP_REPOSITORY_URL', 'DATABASE_URL', 'POSTGRES_URL'])

  return {
    conn: createWalletConnection(walletUri),
    pickupRepoConn: parsePickupRepositoryUrl(pickupRepositoryUrl),
    walletKey: requireEnv(env, 'WALLET_KEY'),
    walletKeyDerivationMethod: env.WALLET_KEY_DERIVATION_METHOD,
    inactiveDaysThreshold: parseOptionalNumber(env.INACTIVE_DAYS_THRESHOLD, 'INACTIVE_DAYS_THRESHOLD'),
    ignoreProjectId: env.IGNORE_PROJECT_ID,
  }
}

export async function runCredoMediatorPrunerFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const pruner = new CredoMediatorPruner({
    ...buildCredoMediatorPrunerOptionsFromEnv(env),
    storeFactory: createAskarNodeJsStoreFactory(),
  })

  await pruner.prune()
}

export function parsePickupRepositoryUrl(value: string): PickupRepositoryConnection {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error('PICKUP_REPOSITORY_URL must be a valid postgres connection URL')
  }

  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error('PICKUP_REPOSITORY_URL must use the postgres: or postgresql: protocol')
  }

  return {
    connectionString: value,
  }
}

function createWalletConnection(uri: string): WalletConnection {
  return {
    uri,
    connect: async () => undefined,
    close: async () => undefined,
  }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function requireAnyEnv(env: NodeJS.ProcessEnv, names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) {
      return value
    }
  }

  throw new Error(`Missing required environment variable: one of ${names.join(', ')}`)
}

function parseOptionalNumber(value: string | undefined, name: string): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`)
  }

  return parsed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCredoMediatorPrunerFromEnv().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
