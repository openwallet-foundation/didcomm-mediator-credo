import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

export const postgresConfig = {
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
}

export function uniqueDatabaseName(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export async function withClient<T>(database: string | undefined, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ ...postgresConfig, database })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

export async function dropDatabase(database: string) {
  await withClient(undefined, (client) => client.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`))
}
