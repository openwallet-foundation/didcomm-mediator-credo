---
"@credo-ts/didcomm-transport-queue-postgres": patch
---

fix: migration `005` brings databases created by the v0.5.x `live-mode-postgres` pickup repository, which recorded different migrations as `002`–`004`, up to the current schema, and indexes `live_session` by `instance` for the reaper and shutdown.
