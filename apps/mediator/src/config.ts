import path from 'node:path'
import { LogLevel } from '@credo-ts/core'

import nconf from 'nconf'
import { Logger } from './logger'

const dirName = __dirname
const configFileName = 'config.json'

/**
 * These settings contain sensitive information and should not be
 * stored in the repo. They are extracted from environment variables
 * and added to the config.
 */
const agentPort = Number(process.env.AGENT_PORT ?? 3110)

const logLevel = process.env.LOG_LEVEL ?? LogLevel.debug
export const logger = new Logger(logLevel as LogLevel)

const messagePickupStorage = process.env.MESSAGE_PICKUP_STORAGE ?? 'credo'
if (messagePickupStorage === 'dynamodb') {
  if (!process.env.MESSAGE_PICKUP_STORAGE_DYNAMODB_REGION) {
    throw new Error(
      `Missing reuqired MESSAGE_PICKUP_STORAGE_DYNAMODB_REGION for MESSAGE_PICKUP_STORAGE type 'dynamodb'`
    )
  }
  if (!process.env.MESSAGE_PICKUP_STORAGE_DYNAMODB_ACCESS_KEY_ID) {
    throw new Error(
      `Missing reuqired MESSAGE_PICKUP_STORAGE_DYNAMODB_ACCESS_KEY_ID for MESSAGE_PICKUP_STORAGE type 'dynamodb'`
    )
  }
  if (!process.env.MESSAGE_PICKUP_STORAGE_DYNAMODB_SECRET_ACCESS_KEY) {
    throw new Error(
      `Missing reuqired MESSAGE_PICKUP_STORAGE_DYNAMODB_SECRET_ACCESS_KEY for MESSAGE_PICKUP_STORAGE type 'dynamodb'`
    )
  }

  logger.info('Using dynamodb message pickup storage')
} else if (messagePickupStorage !== 'credo') {
  throw new Error(
    `Unsupported message pickup storage '${messagePickupStorage}'. Supported values are 'credo' (default) and 'dynamodb'`
  )
} else {
  logger.info('Using credo message pickup storage')
}

const cacheStorage = process.env.CACHE_STORAGE ?? 'in-memory'
if (cacheStorage === 'redis') {
  if (!process.env.CACHE_STORAGE_REDIS_URL) {
    throw new Error(`Missing reuqired CACHE_STORAGE_REDIS_URL for CACHE_STORAGE type 'redis'`)
  }
  logger.info('Using redis cache storage')
} else if (cacheStorage !== 'in-memory') {
  throw new Error(`Unsupported cache storage '${cacheStorage}'. Supported values are 'in-memory' (default) and 'redis'`)
} else {
  logger.info('Using in-memory cache storage')
}

// overrides are always as defined
nconf.overrides({
  db: {
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    adminUser: process.env.POSTGRES_ADMIN_USER,
    adminPassword: process.env.POSTGRES_ADMIN_PASSWORD,
  },
  messagePickupStorage:
    messagePickupStorage === 'credo'
      ? {
          type: messagePickupStorage,
        }
      : {
          type: messagePickupStorage,
          region: process.env.MESSAGE_PICKUP_STORAGE_DYNAMODB_REGION,
          accessKeyId: process.env.MESSAGE_PICKUP_STORAGE_DYNAMODB_ACCESS_KEY_ID,
          secretAccessKey: process.env.MESSAGE_PICKUP_STORAGE_DYNAMODB_SECRET_ACCESS_KEY,
        },
  cacheStorage:
    cacheStorage === 'in-memory'
      ? {
          type: cacheStorage,
        }
      : {
          type: cacheStorage,
          url: process.env.CACHE_STORAGE_REDIS_URL,
        },
  agent: {
    port: agentPort,
    endpoints: process.env.AGENT_ENDPOINTS
      ? process.env.AGENT_ENDPOINTS.split(',')
      : [`http://localhost:${agentPort}`, `ws://localhost:${agentPort}`],
    name: process.env.AGENT_NAME ?? 'My Mediator',
    invitationUrl: process.env.INVITATION_URL ?? `http://localhost:${agentPort}`,
    logLevel,
    usePushNotifications: process.env.USE_PUSH_NOTIFICATIONS === 'true',
    notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL,
    pushNotificationTitle: process.env.PUSH_NOTIFICATION_TITLE,
    pushNotificationBody: process.env.PUSH_NOTIFICATION_BODY,
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    },
    cache: {},
  },
  wallet: {
    name: process.env.WALLET_NAME,
    key: process.env.WALLET_KEY,
  },
})

// load other properties from file.
nconf
  .argv({ parseValues: true })
  .env()
  .file({ file: path.join(dirName, '../', configFileName) })

// if nothing else is set, use defaults. This will be set
// if they do not exist in overrides or the config file.

export default nconf
