import { MessagePickupRepository } from '@credo-ts/core'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'
import config from '../config'
import { Logger } from '../logger'
import { PickupType } from './type'

const logger = new Logger(config.get('agent:logLevel'))

type PickupConfig = {
  useBaseConnection?: boolean
  postgresHost?: string
  postgresUser?: string
  postgresPassword?: string
  postgresDatabaseName?: string
}

export abstract class PickupLoader {
  constructor(public readonly pickupConfig: PickupConfig) {}
  abstract load(): Promise<MessagePickupRepository | undefined>
}

export const loadPickup = async (type: PickupType, strategy: MessageForwardingStrategy) => {
  if (!Object.values(MessageForwardingStrategy).includes(strategy as MessageForwardingStrategy)) {
    throw new Error(
      `Invalid pickup forwarding strategy: ${strategy}, must be one of ${Object.values(MessageForwardingStrategy).join(', ')}`
    )
  }

  logger.info(`Loading pickup with forwarding strategy: ${strategy}`)

  const normalizedType = type.toLowerCase()
  switch (normalizedType) {
    case PickupType.Postgres.toLowerCase(): {
      const { PostgresPickupLoader } = await import('./postgresLoader')
      return await new PostgresPickupLoader().load()
    }
    default:
      throw new Error(`Unsupported pickup type: ${type}, must be one of ${Object.values(PickupType).join(', ')}`)
  }
}
