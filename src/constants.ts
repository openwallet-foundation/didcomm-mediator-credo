import { LogLevel } from '@credo-ts/core'

export const AGENT_PORT = process.env.AGENT_PORT ? Number(process.env.AGENT_PORT) : 3000
export const AGENT_NAME = process.env.AGENT_NAME || 'Credo Mediator'
export const WALLET_NAME = process.env.WALLET_NAME || 'credo-mediator-dev'
export const WALLET_KEY = process.env.WALLET_KEY || 'credo-mediator-dev'
export const AGENT_ENDPOINTS = process.env.AGENT_ENDPOINTS?.split(',') ?? [
  `http://localhost:${AGENT_PORT}`,
  `ws://localhost:${AGENT_PORT}`,
]

export const POSTGRES_HOST = process.env.POSTGRES_HOST
export const POSTGRES_USER = process.env.POSTGRES_USER
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD
export const POSTGRES_ADMIN_USER = process.env.POSTGRES_ADMIN_USER
export const POSTGRES_ADMIN_PASSWORD = process.env.POSTGRES_ADMIN_PASSWORD

export const INVITATION_URL = process.env.INVITATION_URL

export const USE_SOCKETDOCK = process.env.USE_SOCKETDOCK === 'true'

export const LOG_LEVEL = LogLevel.debug

export const IS_DEV = process.env.NODE_ENV === 'development'

export const USE_PUSH_NOTIFICATIONS = process.env.USE_PUSH_NOTIFICATIONS === 'true'

export const NOTIFICATION_WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL || 'http://localhost:5000'
