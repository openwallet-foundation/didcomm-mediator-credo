import { AgentContext, didKeyToVerkey } from '@credo-ts/core'
import {
  DidCommConnectionRecord,
  DidCommKeylistUpdateAction,
  DidCommKeylistUpdateMessage,
  DidCommMediationRepository,
  DidCommMediationRole,
} from '@credo-ts/didcomm'
import type { MediatorAgent } from '../agent.js'

/**
 * Credo routes a forward to the single mediation record holding its recipient key, so a key registered by a second
 * connection breaks routing for it. A keylist-update adding a key moves it from other connections' records instead.
 * Any mediated connection can therefore take over routing for a key it adds.
 */
export function registerRecipientKeyReassignment(agent: MediatorAgent) {
  agent.didcomm.registerMessageHandlerMiddleware(async (context, next) => {
    const { connection, message, agentContext } = context
    if (connection && message instanceof DidCommKeylistUpdateMessage) {
      await reassignRecipientKeys(agentContext, connection, message)
    }
    return next()
  })
}

async function reassignRecipientKeys(
  agentContext: AgentContext,
  connection: DidCommConnectionRecord,
  message: DidCommKeylistUpdateMessage
) {
  const mediationRepository = agentContext.resolve(DidCommMediationRepository)

  // Credo rejects the update without a granted record, which would leave the moved keys with no record at all
  const ownRecord = await mediationRepository.findSingleByQuery(agentContext, { connectionId: connection.id })
  if (!ownRecord?.isReady || ownRecord.role !== DidCommMediationRole.Mediator) return

  for (const update of message.updates) {
    if (update.action !== DidCommKeylistUpdateAction.add) continue

    try {
      const recipientKey = didKeyToVerkey(update.recipientKey)
      const records = await mediationRepository.findByQuery(agentContext, { recipientKeys: [recipientKey] })
      for (const record of records) {
        if (record.connectionId === connection.id) continue

        agentContext.config.logger.info(
          `[reassignRecipientKeys] Moving recipient key ${recipientKey} from connection ${record.connectionId} to connection ${connection.id}`
        )
        record.recipientKeys = record.recipientKeys.filter((key) => key !== recipientKey)
        await mediationRepository.update(agentContext, record)
      }
    } catch (error) {
      agentContext.config.logger.warn(
        `[reassignRecipientKeys] Failed to move recipient key ${update.recipientKey} to connection ${connection.id}`,
        { error }
      )
    }
  }
}
