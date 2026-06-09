import { LogLevel } from '@credo-ts/core'

// Runtime-toggleable log level for the debug instrumentation. Held separately
// from the agent's own logger so the /admin/log-level endpoint can dial the
// structured-instrumentation verbosity up and down during a debug window
// without a redeploy (no WS-reconnect storms). Defaults to `info`, which means
// the verbose `debug`-level hop lines (inbound transport fingerprints) stay off
// until explicitly enabled.
let _level: LogLevel = LogLevel.info

export function getDebugLogLevel(): LogLevel {
  return _level
}

export function setDebugLogLevel(level: LogLevel): void {
  _level = level
}
