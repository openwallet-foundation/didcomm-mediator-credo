import { Agent } from '@credo-ts/core'

import {
  DidCommOutOfBandRecord,
  DidCommOutOfBandRepository,
  DidCommOutOfBandRole,
  DidCommOutOfBandState,
} from '@credo-ts/didcomm'
import { MediatorAgent, createAgent } from './agent'
import { config } from './config'

function logInvitationUrl(agent: MediatorAgent, outOfBandRecord: DidCommOutOfBandRecord) {
  const httpEndpoint = config.agentEndpoints.find((e) => e.startsWith('http'))
  if (!httpEndpoint) {
    throw new Error('No HTTP endpoint configured for invitation generation')
  }

  const mediatorInvitationUrlLong = outOfBandRecord.outOfBandInvitation.toUrl({
    domain: config.invitationUrl,
  })

  agent.config.logger.info(`Out of band invitation url:\n\n\t${mediatorInvitationUrlLong}`)
}

async function createMediatorInvitation(agent: Agent) {
  return agent.modules.oob.createInvitation({
    multiUseInvitation: true,
    goalCode: config.invitationGoalCode,
    goal: 'Mediator Invitation',
  })
}

void createAgent().then(async (agent) => {
  agent.config.logger.info('Agent started')

  if (config.createNewInvitation) {
    agent.config.logger.info('Recreating out of band invitation')
    const outOfBandRecord = await createMediatorInvitation(agent)
    return logInvitationUrl(agent, outOfBandRecord)
  }

  const oobRepo = agent.dependencyManager.resolve(DidCommOutOfBandRepository)
  const outOfBandRecords = await oobRepo.findByQuery(agent.context, {
    state: DidCommOutOfBandState.AwaitResponse,
    role: DidCommOutOfBandRole.Sender,
  })

  let outOfBandRecord = outOfBandRecords
    .filter((oobRecord) => oobRecord.reusable)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  if (outOfBandRecord) {
    agent.config.logger.info('Reusing existing out of band invitation')
  } else {
    agent.config.logger.warn('No reusable out of band invitation found, creating a new one')
    outOfBandRecord = await createMediatorInvitation(agent)
  }

  logInvitationUrl(agent, outOfBandRecord)
})
