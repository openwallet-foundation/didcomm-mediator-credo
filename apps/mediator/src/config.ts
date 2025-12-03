import { LogLevel } from '@credo-ts/core'
import { DidCommMessageForwardingStrategy } from '@credo-ts/didcomm'
import { z } from 'zod/v4'
import { $ZodError } from 'zod/v4/core'
import { loadConfigSync } from 'zod-config'
import { envAdapter } from 'zod-config/env-adapter'
import { jsonAdapter } from 'zod-config/json-adapter'
import { Logger } from './logger/index.js'

const zConfig = z
  .object({
    logLevel: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'off'] as const, {
        error:
          "Log level must be one of 'trace' | 'debug' | 'info' (default) | 'warn' | 'error' | 'fatal' | 'off'. Can also be set using LOG_LEVEL environment variable",
      })
      .default('info'),

    storage: z
      .discriminatedUnion(
        'type',
        [
          z.object({
            type: z.literal('askar'),
          }),
          z.object({
            type: z.literal('drizzle'),
            dialect: z
              .enum(['postgres', 'sqlite'], {
                error:
                  "Drizzle dialect must be one of 'sqlite' (default) | 'postgres'. Can also be set using DRIZZLE__DIALECT environment variable",
              })
              .default('sqlite'),
            databaseUrl: z.url({
              error:
                "Drizzle database url must be a valid url. Can also be set using 'DRIZZLE__DATABASE_URL' environment variable",
            }),
          }),
        ],
        { error: "Storage type must be one of 'askar' (default) | 'drizzle'" }
      )
      .default({
        type: 'askar',
      }),

    kms: z
      .object({
        type: z.literal('askar', {
          error:
            "Kms type must be provided. Supported kms types are 'askar' (default). Can also be set using KMS__TYPE environment variable",
        }),
      })
      .default({
        type: 'askar',
      }),

    askar: z.object(
      {
        storeId: z.string({
          error: "Askar store id must be a string. Can also be set using 'ASKAR__STORE_ID' environment variable",
        }),
        storeKey: z.string({
          error: "Askar store key must be string. Can also be set using 'ASKAR__STORE_KEY' environment variable",
        }),
        keyDerivationMethod: z
          .enum(['kdf:argon2i:mod', 'kdf:argon2i:int', 'raw'], {
            error:
              "Askar key derivation method must be one of 'kdf:argon2i:mod' (default) | 'kdf:argon2i:int' | 'raw'. Can also be set using ASKAR__KEY_DERIVATION_METHOD environment variable",
          })
          .default('kdf:argon2i:mod'),
        database: z
          .discriminatedUnion(
            'type',
            [
              z.object({
                type: z.literal('sqlite'),
              }),
              z.object({
                type: z.literal('postgres'),
                host: z.string({
                  error:
                    "Askar database host must be a string when database type is 'postgres'. Can also be set using 'ASKAR__DATABASE__HOST' environment variable",
                }),
                user: z.string({
                  error:
                    "Askar database user must be a string when database type is 'postgres'. Can also be set using 'ASKAR__DATABASE__USER' environment variable",
                }),
                password: z.string({
                  error:
                    "Askar database password must be a string when database type is 'postgres'. Can also be set using 'ASKAR__DATABASE__PASSWORD' environment variable",
                }),
                adminUser: z
                  .string({
                    error:
                      "Askar database admin user must be a string. Can also be set using 'ASKAR__DATABASE__ADMIN_USER' environment variable",
                  })
                  .optional(),
                adminPassword: z
                  .string({
                    error:
                      "Askar database admin password must be a string. Can also be set using 'ASKAR__DATABASE__ADMIN_PASSWORD' environment variable",
                  })
                  .optional(),
              }),
            ],
            { error: "Askar database type must be one of 'sqlite' (default) | 'postgres'" }
          )
          .default({ type: 'sqlite' }),
      },
      {
        error:
          "Askar configuration must be provided. Can also be seting using 'ASKAR__<KEY>' environment variables (e.g. 'ASKAR__STORE_ID')",
      }
    ),

    cache: z
      .discriminatedUnion(
        'type',
        [
          z.object({
            type: z.literal('in-memory'),
          }),
          z.object({
            type: z.literal('redis'),
            redisUrl: z.url({
              error:
                "Cache redis url must be a valid url when cache type is 'redis'. Can also be set using 'CACHE__REDIS_URL' environment variable",
            }),
          }),
        ],
        { error: "Cache type must be one of 'in-memory' (default) | 'redis'" }
      )
      .default({
        type: 'in-memory',
      }),

    messagePickup: z
      .object({
        forwardingStrategy: z
          .enum(DidCommMessageForwardingStrategy, {
            error:
              "Message pickup forwarding strategy must be one of 'DirectDelivery' (default) | 'QueueOnly' | 'QueueAndLiveModeDelivery'. Can also be set using MESSAGE_PICKUP__FORWARDING_STRATEGRY environment variable",
          })
          .default(DidCommMessageForwardingStrategy.DirectDelivery),
        storage: z
          .discriminatedUnion(
            'type',
            [
              z.object({
                type: z.literal('credo'),
              }),
              z.object({
                type: z.literal('postgres'),
                host: z.string({
                  error:
                    "Message pickup storage host must be a string when message pickup storage type is 'postgres'. Can also be set using 'MESSAGE_PICKUP__STORAGE__HOST' environment variable",
                }),
                user: z.string({
                  error:
                    "Message pickup storage user must be a string when message pickup storage type is 'postgres'. Can also be set using 'MESSAGE_PICKUP__STORAGE__USER' environment variable",
                }),
                password: z.string({
                  error:
                    "Message pickup storage password must be a string when message pickup storage type is 'postgres'. Can also be set using 'MESSAGE_PICKUP__STORAGE__PASSWORD' environment variable",
                }),
                database: z.string({
                  error:
                    "Message pickup storage database must be a string when message pickup storage type is 'postgres'. Can also be set using 'MESSAGE_PICKUP__STORAGE__DATABASE' environment variable",
                }),
              }),
              z.object({
                type: z.literal('dynamodb'),
                region: z
                  .string({
                    error:
                      "Message pickup storage region must be a string when message pickup storage type is 'dynamodb'. Can also be set using 'MESSAGE_PICKUP__STORAGE__REGION' environment variable",
                  })
                  .optional(),
                accessKeyId: z.string({
                  error:
                    "Message pickup storage access key id must be a string when message pickup storage type is 'dynamodb'. Can also be set using 'MESSAGE_PICKUP__STORAGE__ACCESS_KEY_ID' environment variable",
                }),
                tableName: z
                  .string({
                    error:
                      "Message pickup storage table name must be a string when message pickup storage type is 'dynamodb'. Can also be set using 'MESSAGE_PICKUP__STORAGE__TABLE_NAME' environment variable",
                  })
                  .optional(),
                secretAccessKey: z.string({
                  error:
                    "Message pickup storage secret access key must be a string when message pickup storage type is 'dynamodb'. Can also be set using 'MESSAGE_PICKUP__STORAGE__SECRET_ACCESS_KEY' environment variable",
                }),
              }),
            ],
            { error: "Message pickup storage type must be one of 'credo' (default) | 'postgres' | 'dynamodb'" }
          )
          .default({
            type: 'credo',
          }),
        multiInstanceDelivery: z
          .discriminatedUnion(
            'type',
            [
              // No multi instance publishing. In case you only run a single mediator instance it is not needed to handle multi instance delivery
              // Some storage implementations also handle the multi-instance delivery. In that case you should also configure `none` (e.g. `storage.postgres`).
              z.object({
                type: z.literal('none'),
              }),
              // Use redis multi instance delivery. When using this option the cache implementation MUST also be redis
              z.object({
                type: z.literal('redis'),
              }),
            ],
            { error: "Multi instance message delivery type must be one of 'none' (default) | 'redis'" }
          )
          .default({
            type: 'none',
          }),
      })
      .default({
        forwardingStrategy: DidCommMessageForwardingStrategy.DirectDelivery,
        storage: {
          type: 'credo',
        },
        multiInstanceDelivery: {
          type: 'none',
        },
      }),

    pushNotifications: z
      .object({
        webhookUrl: z
          .url({
            error:
              "Push notifications webhook url must be a valid url. Can also be set using 'PUSH_NOTIFICATIONS__WEBHOOK_URL' environment variable",
          })
          .optional(),
        firebase: z
          .object({
            projectId: z.string({
              error:
                "Firebase push notifications project id must be a string when firebase is configured. Can also be set using 'PUSH_NOTIFICATIONS__FIREBASE__PROJECT_ID' environment variable",
            }),
            clientEmail: z.email({
              error:
                "Firebase push notifications client email must be a string when firebase is configured. Can also be set using 'PUSH_NOTIFICATIONS__FIREBASE__CLIENT_EMAIL' environment variable",
            }),
            privateKey: z
              .string({
                error:
                  "Firebase push notifications private key must be a string when firebase is configured. Can also be set using 'PUSH_NOTIFICATIONS__FIREBASE__PRIVATE_KEY' environment variable",
              })
              .transform((key) => (key.includes('\\n') ? key.replace(/\\n/g, '\n') : key.trim())),
            notificationTitle: z.string({
              error:
                "Firebase push notifications title must be a string when firebase is configured. Can also be set using 'PUSH_NOTIFICATIONS__FIREBASE__NOTIFICATION_TITLE' environment variable",
            }),
            notificationBody: z.string({
              error:
                "Firebase push notifications body must be a string when firebase is configured. Can also be set using 'PUSH_NOTIFICATIONS__FIREBASE__NOTIFICATION_BODY' environment variable",
            }),
          })
          .optional(),
      })
      .default({}),

    agentPort: z.coerce
      .number({
        error: "Agent port must be a number. Defaults to 3110. Can also be set using 'AGENT_PORT' environment variable",
      })
      .default(3110),
    agentEndpoints: z
      .union([z.string().transform((s) => s.split(',')), z.array(z.string())], {
        error:
          "Agent endpoints must be an array of valid urls. Defaults to 3110. Can also be set using 'AGENT_ENDPOINTS' environment variable (values seperated by ,)",
      })
      .pipe(
        z
          .array(
            z.url({
              error:
                "Agent endpoints must be an array of valid urls. Defaults to 3110. Can also be set using 'AGENT_ENDPOINTS' environment variable (values seperated by ,)",
            }),
            {
              error:
                "Agent endpoints must be an array of valid urls. Defaults to 3110. Can also be set using 'AGENT_ENDPOINTS' environment variable (values seperated by ,)",
            }
          )
          .min(1)
      )
      .refine((urls) => urls.some((url) => url.startsWith('http://') || url.startsWith('https://')), {
        error: 'Agent endpoints must contain at least one http:// or https:// url',
      })
      .default([]),
    agentName: z
      .string({
        error:
          "Agent name must be a string. Defaults to 'Credo DIDComm Mediator'. Can also be set using 'AGENT_NAME' environment variable",
      })
      .default('Credo DIDComm Mediator'),
    invitationUrl: z
      .url({
        error:
          "Invitation url must be a valid url. Defaults to '/invitation' on the first configured http(s) agent endpoint. Can also be set using 'INVITATION_URL' environment variable",
      })
      .optional(),
    invitationGoalCode: z.string().optional(),
    createNewInvitation: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .or(z.boolean())
      .optional()
      .default(false),
  })
  .refine((config) => config.messagePickup.multiInstanceDelivery.type !== 'redis' || config.cache.type === 'redis', {
    path: ['messagePickup', 'multiInstanceDelivery', 'type'],
    error: "When message pickup delivery type is 'redis', the cache type MUST also be 'redis'.",
  })
  .transform((config) => {
    const agentEndpoints =
      config.agentEndpoints.length === 0
        ? [`http://localhost:${config.agentPort}`, `ws://localhost:${config.agentPort}`]
        : config.agentEndpoints

    const httpEndpoint = agentEndpoints.find(
      (endpoint) => endpoint.startsWith('http://') || endpoint.startsWith('https://')
    )
    return {
      ...config,
      agentEndpoints,
      invitationUrl: config.invitationUrl ?? `${httpEndpoint}/invitation`,
    }
  })

export type Config = z.infer<typeof zConfig>
export const config = loadMediatorConfig()
export const logger = new Logger(LogLevel[config.logLevel])

function loadMediatorConfig(): Config {
  try {
    const envAdapterInstance = envAdapter({
      nestingSeparator: '__',
      transform: ({ key, value }) => ({
        key: key
          .split('__')
          .map((word) => transformWord(word))
          .join('__'),
        value,
      }),
    })

    const config = loadConfigSync({
      schema: zConfig,
      adapters: process.env.CONFIG
        ? [
            envAdapterInstance,
            jsonAdapter({
              path: process.env.CONFIG,
            }),
          ]
        : envAdapterInstance,
    })

    return config
  } catch (error) {
    if (error instanceof $ZodError) {
      throw new Error(`Error while parsing configuration for mediator:\n\n${z.prettifyError(error)}\n\n`)
    }

    throw error
  }
}

/**
 * Transforms a word from an environment variable into the casing as used by the JSON config.
 *
 * This means `_` are replaced and updated to camelCase. Leading and trailing `_` are preserved.
 */
function transformWord(word: string) {
  const match = word.match(/^(_*)(.*?)(_*)$/)

  if (!match) {
    return word // Handle edge case of all underscores or empty string
  }

  const [, leadingUnderscores, content, trailingUnderscores] = match

  const camelCased = content
    .toLowerCase()
    .split('_')
    .filter((wordItem) => wordItem.length > 0)
    .map((wordItem, index) => (index === 0 ? wordItem : wordItem.charAt(0).toUpperCase() + wordItem.slice(1)))
    .join('')

  return leadingUnderscores + camelCased + trailingUnderscores
}
