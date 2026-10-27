import type { Agent } from '@credo-ts/core'
import type { ExtendedQueueTransportRepository } from './config/messagePickupLoader.js'

export function registerShutdownHandlers(agent: Agent, queueTransportRepository: ExtendedQueueTransportRepository) {
  let shuttingDown: Promise<void> | undefined

  const shutdown = (exitCode: number) => {
    shuttingDown ??= (async () => {
      agent.config.logger.info('Shutting down')
      const steps = [
        // Releases this instance's live sessions so other instances take over without waiting for the reaper
        () => queueTransportRepository.shutdown?.(agent.context),
        () => agent.shutdown(),
      ]
      for (const step of steps) {
        try {
          await step()
        } catch (error) {
          agent.config.logger.error('Error during shutdown', { error })
          exitCode ||= 1
        }
      }
      process.exit(exitCode)
    })()
    return shuttingDown
  }

  process.once('SIGTERM', () => shutdown(0))
  process.once('SIGINT', () => shutdown(0))
  process.once('uncaughtException', (error) => {
    agent.config.logger.fatal('Uncaught exception', { error })
    return shutdown(1)
  })
}
