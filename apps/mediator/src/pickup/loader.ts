import { MessagePickupRepository } from '@credo-ts/core'
import { PickupType } from './type'
import { MessageForwardingStrategy } from '@credo-ts/core/build/modules/routing/MessageForwardingStrategy'
import { Logger } from '../logger'
import config from '../config'

const logger = new Logger(config.get('agent:logLevel'))

export abstract class PickupLoader {
    constructor(public readonly pickupConfig: any) {}
    abstract load(config: any): Promise<MessagePickupRepository | undefined>;
}

export const loadPickup = async (type: PickupType, strategy: MessageForwardingStrategy) => {
    
    if (!Object.values(MessageForwardingStrategy).includes(strategy as MessageForwardingStrategy)) {
        throw new Error(`Invalid pickup forwarding strategy: ${strategy}, must be one of ${Object.values(MessageForwardingStrategy).join(', ')}`)
    }
    
    logger.info(`Loading pickup with forwarding strategy: ${strategy}`)

    switch (type) {
        case PickupType.Postgres.toLowerCase():
            const { PostgresPickupLoader } = await import('./postgresLoader')
            return await new PostgresPickupLoader().load()
        default:
            throw new Error(`Unsupported pickup type: ${type}, must be one of ${Object.values(PickupType).join(', ')}`)
    }
}