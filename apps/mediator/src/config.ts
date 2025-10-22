import path from 'node:path'
import { LogLevel } from '@credo-ts/core'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'
import dotenv from 'dotenv'
import nconf from 'nconf'

const dirName = __dirname
const configFileName = 'config.json'
const env = process.env.NODE_ENV ?? 'development'

if (env === 'development') {
  dotenv.config()
}

/**
 * These settings contain sensitive information and should not be
 * stored in the repo. They are extracted from environment variables
 * and added to the config.
 */

const agentPort = Number(process.env.AGENT_PORT ?? 3110)

type FirebaseConfigObject = {
  projectId: string
  clientEmail: string
  privateKey: string
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
  agent: {
    port: agentPort,
    endpoints: process.env.AGENT_ENDPOINTS
      ? process.env.AGENT_ENDPOINTS.split(',')
      : [`http://localhost:${agentPort}`, `ws://localhost:${agentPort}`],
    name: process.env.AGENT_NAME ?? 'My Mediator',
    invitationUrl: process.env.INVITATION_URL,
    recreateInvitation: process.env.CREATE_NEW_INVITATION === 'true',
    goalCode: process.env.GOAL_CODE ?? 'mediator',
    logLevel: process.env.LOG_LEVEL ?? LogLevel.debug,
    usePushNotifications: process.env.USE_PUSH_NOTIFICATIONS === 'true',
    notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL,
    pushNotificationTitle: process.env.PUSH_NOTIFICATION_TITLE,
    pushNotificationBody: process.env.PUSH_NOTIFICATION_BODY,
    firebase: JSON.parse(process.env.FIREBASE_APPS ?? '[]') as FirebaseConfigObject[],
    pickup: {
      type: process.env.PICKUP_TYPE?.toString().toLowerCase(),
      strategy: process.env.PICKUP_STRATEGY ?? MessageForwardingStrategy.DirectDelivery,
      settings: process.env.PICKUP_SETTINGS ?? JSON.stringify({}),
    },
  },
  wallet: {
    name: process.env.WALLET_NAME ?? 'mediator-dev',
    key: process.env.WALLET_KEY ?? 'blarbzzz',
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
