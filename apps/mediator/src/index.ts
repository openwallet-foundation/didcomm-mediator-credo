import { OutOfBandRepository, OutOfBandRole, OutOfBandState } from '@credo-ts/didcomm'

import { createAgent } from './agent'
import { config } from './config'

void createAgent().then(async (agent) => {
  agent.config.logger.info('Agent started')

  // Try to find existing out of band record
  const oobRepo = agent.dependencyManager.resolve(OutOfBandRepository)
  const outOfBandRecords = await oobRepo.findByQuery(agent.context, {
    state: OutOfBandState.AwaitResponse,
    role: OutOfBandRole.Sender,
  })

  let outOfBandRecord = outOfBandRecords.find((oobRecord) => oobRecord.reusable)

  // If it does't exist, we create a new one
  if (!outOfBandRecord) {
    outOfBandRecord = await agent.modules.oob.createInvitation({
      multiUseInvitation: true,
    })
  }

  const mediatorInvitationUrlLong = outOfBandRecord.outOfBandInvitation.toUrl({
    domain: config.invitationUrl,
  })

  agent.config.logger.info(`Out of band invitation url: \n\n\t${mediatorInvitationUrlLong}`)
})
