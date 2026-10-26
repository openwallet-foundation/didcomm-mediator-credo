---
"@credo-ts/didcomm-transport-queue-postgres": patch
---

fix: failed live deliveries go back to `pending` right away and unacked ones after `ackTimeoutMs` (default 60s). A new `TransportQueuePostgresMessagesPending` event tells listeners when to wake the recipient. Messages already stuck in `sending` are delivered again once after upgrading.
