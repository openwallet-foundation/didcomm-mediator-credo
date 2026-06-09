# Mediator Askar to Drizzle Migration Runbook

This is a reusable execution guide for migrating a mediator from Askar storage to Drizzle storage on ECS.

Replace all placeholder values before running:

```text
<DRIZZLE_DATABASE_URL>       Target Drizzle Postgres URL
<ASKAR_STORE_ID>            Existing Askar store id
<ASKAR_STORE_KEY>           Existing Askar store key
<ASKAR_DATABASE_HOST>       Existing Askar Postgres host:port
<ASKAR_DATABASE_USER>       Existing Askar Postgres user
<ASKAR_DATABASE_PASSWORD>   Existing Askar Postgres password
<ASKAR_DATABASE_ADMIN_USER> Existing Askar Postgres admin user
<ASKAR_DATABASE_ADMIN_PASSWORD> Existing Askar Postgres admin password
YYYYMMDD                    Replace this in backup table names with the migration date or another unique suffix
```

Before starting:

- Stop the real mediator service.
- Do not run the migration as an ECS service. Use **ECS -> Cluster -> Tasks -> Run task**.
- Keep the old Askar DB untouched.
- If retrying after a failed phase 2, reset only the target Drizzle DB schema first.

## Optional Reset Before Retry

Run this in pgAdmin on the target Drizzle DB:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;

CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

## Phase 1: Drizzle Schema Migration

### Phase 1 Environment Variables

```json
[
  {
    "name": "STORAGE__TYPE",
    "value": "drizzle"
  },
  {
    "name": "STORAGE__DIALECT",
    "value": "postgres"
  },
  {
    "name": "STORAGE__DATABASE_URL",
    "value": "<DRIZZLE_DATABASE_URL>"
  },
  {
    "name": "DRIZZLE_DATABASE_URL",
    "value": "<DRIZZLE_DATABASE_URL>"
  }
]
```

### Phase 1 Command

```json
{
  "entryPoint": ["sh", "-c"],
  "command": [
    "pnpm --filter didcomm-mediator-service run drizzle:migrate:postgres"
  ]
}
```

Expected log:

```text
migrations applied successfully
Applying migrations completed successfully
```

## pgAdmin SQL After Phase 1 And Before Phase 2

Run this in the target Drizzle DB.

First verify tables exist:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
```

You should see tables such as:

```text
public | DidcommConnection
public | DidcommMediation
public | PushNotificationsFcm
public | StorageVersion
```

Then run the temporary migration fixes:

```sql
ALTER TABLE public."DidcommMediation"
DROP CONSTRAINT IF EXISTS "DidcommMediation_connection_id_context_correlation_id_DidcommCo";
```

```sql
ALTER TABLE public."PushNotificationsFcm"
ALTER COLUMN "created_at" SET DEFAULT now();
```

```sql
ALTER TABLE public."PushNotificationsFcm"
DROP CONSTRAINT IF EXISTS "PushNotificationsFcm_context_correlation_id_connection_id_DidcommConnection_context_correlation_id_id_fk";
```

## Phase 2: Askar To Drizzle Data Migration

Use the image that includes:

```text
migrate-askar-to-drizzle:skip-missing-adapters
```

### Phase 2 Environment Variables

```json
[
  {
    "name": "KMS__TYPE",
    "value": "askar"
  },
  {
    "name": "ASKAR__STORE_ID",
    "value": "<ASKAR_STORE_ID>"
  },
  {
    "name": "ASKAR__STORE_KEY",
    "value": "<ASKAR_STORE_KEY>"
  },
  {
    "name": "ASKAR__KEY_DERIVATION_METHOD",
    "value": "kdf:argon2i:mod"
  },
  {
    "name": "ASKAR__DATABASE__TYPE",
    "value": "postgres"
  },
  {
    "name": "ASKAR__DATABASE__HOST",
    "value": "<ASKAR_DATABASE_HOST>"
  },
  {
    "name": "ASKAR__DATABASE__USER",
    "value": "<ASKAR_DATABASE_USER>"
  },
  {
    "name": "ASKAR__DATABASE__PASSWORD",
    "value": "<ASKAR_DATABASE_PASSWORD>"
  },
  {
    "name": "ASKAR__DATABASE__ADMIN_USER",
    "value": "<ASKAR_DATABASE_ADMIN_USER>"
  },
  {
    "name": "ASKAR__DATABASE__ADMIN_PASSWORD",
    "value": "<ASKAR_DATABASE_ADMIN_PASSWORD>"
  },
  {
    "name": "STORAGE__TYPE",
    "value": "drizzle"
  },
  {
    "name": "STORAGE__DIALECT",
    "value": "postgres"
  },
  {
    "name": "STORAGE__DATABASE_URL",
    "value": "<DRIZZLE_DATABASE_URL>"
  },
  {
    "name": "DRIZZLE_DATABASE_URL",
    "value": "<DRIZZLE_DATABASE_URL>"
  }
]
```

### Phase 2 Command

```json
{
  "entryPoint": ["sh", "-c"],
  "command": [
    "pnpm --filter didcomm-mediator-service run migrate-askar-to-drizzle:skip-missing-adapters"
  ]
}
```

Expected log:

```text
Successfully initialized drizzle agent
Successfully initialized askar agent
Starting migration of default agent context
Skippping migration of record ... with type 'MessageRecord' due to missing drizzle adapter
Succesfully migrated default agent context
Migration complete
```

The `MessageRecord` skip is expected. It skips old pending queued messages, not reusable connection state.

## pgAdmin SQL After Phase 2

Run this in the target Drizzle DB after phase 2 succeeds.

Back up orphan mediation rows:

```sql
CREATE TABLE "DidcommMediation_orphan_backup_YYYYMMDD" AS
SELECT m.*
FROM "DidcommMediation" m
LEFT JOIN "DidcommConnection" c
  ON c."id" = m."connection_id"
 AND c."context_correlation_id" = m."context_correlation_id"
WHERE c."id" IS NULL;
```

Delete orphan mediation rows:

```sql
DELETE FROM "DidcommMediation" m
WHERE NOT EXISTS (
  SELECT 1
  FROM "DidcommConnection" c
  WHERE c."id" = m."connection_id"
    AND c."context_correlation_id" = m."context_correlation_id"
);
```

Back up orphan push notification rows:

```sql
CREATE TABLE "PushNotificationsFcm_orphan_backup_YYYYMMDD" AS
SELECT p.*
FROM "PushNotificationsFcm" p
LEFT JOIN "DidcommConnection" c
  ON c."id" = p."connection_id"
 AND c."context_correlation_id" = p."context_correlation_id"
WHERE c."id" IS NULL;
```

Delete orphan push notification rows:

```sql
DELETE FROM "PushNotificationsFcm" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "DidcommConnection" c
  WHERE c."id" = p."connection_id"
    AND c."context_correlation_id" = p."context_correlation_id"
);
```

Re-add mediation FK:

```sql
ALTER TABLE public."DidcommMediation"
ADD CONSTRAINT "DidcommMediation_connection_id_context_correlation_id_DidcommCo"
FOREIGN KEY ("connection_id", "context_correlation_id")
REFERENCES public."DidcommConnection" ("id", "context_correlation_id")
ON DELETE cascade
ON UPDATE no action;
```

Re-add push notification FK:

```sql
ALTER TABLE public."PushNotificationsFcm"
ADD CONSTRAINT "PushNotificationsFcm_context_correlation_id_connection_id_DidcommConnection_context_correlation_id_id_fk"
FOREIGN KEY ("context_correlation_id", "connection_id")
REFERENCES public."DidcommConnection" ("context_correlation_id", "id")
ON DELETE cascade
ON UPDATE no action;
```

Optional, restore generated schema behavior:

```sql
ALTER TABLE public."PushNotificationsFcm"
ALTER COLUMN "created_at" DROP DEFAULT;
```

## Final Validation

```sql
SELECT count(*) FROM public."DidcommConnection";
SELECT count(*) FROM public."DidcommMediation";
SELECT count(*) FROM public."PushNotificationsFcm";
SELECT count(*) FROM public."StorageVersion";
```

```sql
SELECT count(*)
FROM "DidcommMediation" m
LEFT JOIN "DidcommConnection" c
  ON c."id" = m."connection_id"
 AND c."context_correlation_id" = m."context_correlation_id"
WHERE c."id" IS NULL;
```

```sql
SELECT count(*)
FROM "PushNotificationsFcm" p
LEFT JOIN "DidcommConnection" c
  ON c."id" = p."connection_id"
 AND c."context_correlation_id" = p."context_correlation_id"
WHERE c."id" IS NULL;
```

Both orphan count queries should return `0`.
