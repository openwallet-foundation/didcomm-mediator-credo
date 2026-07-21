# Credo Mediation Pruner TypeScript Port

This project is a TypeScript port of the logic in `askar_tools/credo_mediator_clean_up.py`.

Current scope:

- Preserves connection staleness logic.
- Preserves `lastSeen`/`updatedAt`/`createdAt` timestamp selection.
- Preserves queued-message protection.
- Preserves deletion of related DID, mediation, and Firebase records.
- Includes a concrete `@openwallet-foundation/askar-nodejs` store adapter.

For the most accurate cleanup behavior, mediation connection records should be tagged with a `lastSeen` timestamp. If `lastSeen` is not present, the cleanup process falls back to `updatedAt`, and then to `createdAt`.

The current cleanup implementation is best-effort, not atomic per connection. It uses session-backed writes instead of a single rollback-capable transaction for each connection record. If a failure happens partway through removing related records, some changes may already have been applied and the next scheduled run is expected to finish any remaining cleanup.

Scheduling is expected to be handled externally, for example with an OpenShift CronJob.

The pruner class can be used directly with the included OWF adapter:

```ts
import { CredoMediatorPruner, createAskarNodeJsStoreFactory } from './src/index.js'

const pruner = new CredoMediatorPruner({
  conn,
  pickupRepoConn,
  walletKey: 'secret',
  walletKeyDerivationMethod: 'ARGON2I_MOD',
  storeFactory: createAskarNodeJsStoreFactory(),
})

await pruner.prune()
```

The package can also run as a process using environment variables:

```bash
export WALLET_URI='sqlite:///wallet.db'
export PICKUP_REPOSITORY_URL='postgres://user:pass@localhost:5432/db'
export WALLET_KEY='secret'
export WALLET_KEY_DERIVATION_METHOD='ARGON2I_MOD'
export INACTIVE_DAYS_THRESHOLD='365'
export IGNORE_PROJECT_ID='bc-wallet-mobile'

pnpm start
```

Supported environment variables:

- `WALLET_URI`: required Askar wallet URI.
- `PICKUP_REPOSITORY_URL`: required Postgres connection URL for the queued message table. `DATABASE_URL` and `POSTGRES_URL` are also accepted.
- `WALLET_KEY`: required wallet key.
- `WALLET_KEY_DERIVATION_METHOD`: optional wallet key derivation method.
- `INACTIVE_DAYS_THRESHOLD`: optional number of inactive days before a connection is deleted.
- `IGNORE_PROJECT_ID`: optional project ID to ignore during cleanup.

## OpenShift CronJob Example

An example monthly OpenShift CronJob manifest is available in `k8s-cronjob.example.yaml`.

The example runs once a month at `03:00` UTC on the first day of the month and starts the cleanup process with `pnpm start`.

## Docker

Container examples are available in `Dockerfile` and `docker-compose.yml`.

Build the mediation-pruner image from the repository root:

```bash
docker build -f apps/mediation-pruner/Dockerfile -t credo-mediation-pruner .
```

Run it with Docker Compose:

```bash
cd apps/mediation-pruner
docker compose up --build
```

The compose example injects the cleanup configuration through environment variables.

## Commands

```bash
pnpm install
pnpm test
pnpm build
```

If pnpm blocks native dependency install scripts on a fresh machine, run `pnpm approve-builds` and approve `@openwallet-foundation/askar-nodejs`, `esbuild`, and `koffi`.