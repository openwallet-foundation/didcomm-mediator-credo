import { LogLevel } from '@credo-ts/core'
import express, { type Express, type Request, type Response } from 'express'

import { getDebugLogLevel, setDebugLogLevel } from './logLevelHolder.js'

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  test: LogLevel.test,
  trace: LogLevel.trace,
  debug: LogLevel.debug,
  info: LogLevel.info,
  warn: LogLevel.warn,
  error: LogLevel.error,
  fatal: LogLevel.fatal,
  off: LogLevel.off,
}

// Runtime toggle for the debug-instrumentation log level. Lets an operator
// dial the structured-logging verbosity up (e.g. to `debug`) for a 15-minute
// debug window and back down to `info`/`warn` afterwards WITHOUT a redeploy —
// avoiding the WS-reconnect churn a rolling ECS deploy would cause.
//
// Guarded by a bearer token. If ADMIN_TOKEN is unset the endpoint returns 503
// (disabled) so it can never be left open by accident.
export function registerAdminEndpoints(app: Express, adminToken: string | undefined): void {
  function authMiddleware(req: Request, res: Response, next: () => void): void {
    if (!adminToken) {
      res.status(503).json({ error: 'admin endpoint disabled (ADMIN_TOKEN not set)' })
      return
    }
    const authHeader = req.headers.authorization
    if (!authHeader || authHeader !== `Bearer ${adminToken}`) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  }

  app.use('/admin', express.json())

  app.get('/admin/log-level', authMiddleware, (_req: Request, res: Response) => {
    const current = getDebugLogLevel()
    const name = Object.entries(LOG_LEVEL_MAP).find(([, v]) => v === current)?.[0] ?? String(current)
    res.json({ level: name, service: 'mediator' })
  })

  app.post('/admin/log-level', authMiddleware, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>
    const level = body?.level
    if (typeof level !== 'string' || !(level in LOG_LEVEL_MAP)) {
      res.status(400).json({ error: 'invalid level', valid: Object.keys(LOG_LEVEL_MAP) })
      return
    }
    setDebugLogLevel(LOG_LEVEL_MAP[level])
    res.json({ level, service: 'mediator', ok: true })
  })
}
