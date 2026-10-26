# @credo-ts/didcomm-transport-queue-postgres

## 0.0.4

### Patch Changes

- fc575ad: chore: support Credo 0.7, the `@credo-ts/core` and `@credo-ts/didcomm` peer dependency range is now `^0.6.0 || ^0.7.0`

## 0.0.3

### Patch Changes

- d986627: fix: failed live deliveries go back to `pending` right away and unacked ones after `ackTimeoutMs` (default 60s). A new `TransportQueuePostgresMessagesPending` event tells listeners when to wake the recipient. Messages already stuck in `sending` are delivered again once after upgrading.

## 0.0.2

### Patch Changes

- f35e7f0: fix: clean up stale live sessions in multi-instance deployments
- f35e7f0: fix: concurrent pickups for the same connection no longer claim the same messages
