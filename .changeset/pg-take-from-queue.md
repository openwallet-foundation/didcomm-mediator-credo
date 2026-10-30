---
"@credo-ts/didcomm-transport-queue-postgres": patch
---

fix: `takeFromQueue` with `deleteMessages` now deletes the messages it returns, in one statement that concurrent takes can't overlap. Without a `limit` it returns every pending message instead of none. Recipient DID lookups use array containment, backed by a GIN index on `recipient_dids` that is built concurrently on startup.
