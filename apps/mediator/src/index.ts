import { OutOfBandRepository, OutOfBandRole, OutOfBandState } from '@credo-ts/core'

import { createAgent } from './agent'
import config from './config'

void createAgent().then(async (agent) => {
  agent.config.logger.info('Agent started')

  // Try to find existing out of band record
  const oobRepo = agent.dependencyManager.resolve(OutOfBandRepository)
  const outOfBandRecords = await oobRepo.findByQuery(agent.context, {
    state: OutOfBandState.AwaitResponse,
    role: OutOfBandRole.Sender,
  })

  let outOfBandRecord = undefined

  if (config.get('agent:recreateInvitation') && outOfBandRecords.length > 0) {
    agent.config.logger.info('Recreating out of band invitation')
    outOfBandRecord = await agent.oob.createInvitation({
      multiUseInvitation: true,
      goalCode: config.get('agent:goalCode'),
      goal: 'Mediator Invitation',
    })
  } else {
    // Latest Reusable Invitation
    outOfBandRecord = outOfBandRecords
      .filter((oobRecord) => oobRecord.reusable)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    agent.config.logger.info('Using existing out of band invitation')
    if (!outOfBandRecord) {
      agent.config.logger.warn('No reusable out of band invitation found, creating a new one')
      outOfBandRecord = await agent.oob.createInvitation({
        multiUseInvitation: true,
        goalCode: config.get('agent:goalCode'),
        goal: 'Mediator Invitation',
      })
    }
  }

  const httpEndpoint = agent.config.endpoints.find((e) => e.startsWith('http')) as string
  const invitationEndpoint = config.get('agent:invitationUrl') ?? `${httpEndpoint}/invite`
  const mediatorInvitationUrlLong = outOfBandRecord.outOfBandInvitation.toUrl({
    domain: invitationEndpoint,
  })

  agent.config.logger.info(`Out of band invitation url: \n\n\t${mediatorInvitationUrlLong}`)
})
