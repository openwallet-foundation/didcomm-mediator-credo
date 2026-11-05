import type { Agent } from '@credo-ts/core'
import type { ExtendedQueueTransportRepository } from './config/messagePickupLoader.js'

const SHUTDOWN_TIMEOUT_MS = 25_000

export function registerShutdownHandlers(agent: Agent, queueTransportRepository: ExtendedQueueTransportRepository) {
  let shuttingDown: Promise<void> | undefined
  let exitCode = 0

  const shutdown = (requestedExitCode: number) => {
    exitCode ||= requestedExitCode
    shuttingDown ??= (async () => {
      let currentStep = 'queue shutdown'
      let timedOut = false
      const watchdog = setTimeout(() => {
        timedOut = true
        agent.config.logger.error(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms during ${currentStep}`)
        process.exit(1)
      }, SHUTDOWN_TIMEOUT_MS)
      watchdog.unref()
      agent.config.logger.info('Shutting down')
      const steps = [
        // Releases this instance's live sessions so other instances take over without waiting for the reaper
        { name: 'queue shutdown', run: () => queueTransportRepository.shutdown?.(agent.context) },
        { name: 'agent shutdown', run: () => agent.shutdown() },
      ]
      try {
        for (const step of steps) {
          currentStep = step.name
          try {
            await step.run()
          } catch (error) {
            agent.config.logger.error(`Error during ${currentStep}`, { error })
            exitCode = 1
          }
          if (timedOut) return
        }
      } finally {
        clearTimeout(watchdog)
      }
      process.exit(exitCode)
    })()
    return shuttingDown
  }

  process.on('SIGTERM', () => shutdown(0))
  process.on('SIGINT', () => shutdown(0))
  process.on('uncaughtException', (error) => {
    agent.config.logger.fatal('Uncaught exception', { error })
    return shutdown(1)
  })
}
