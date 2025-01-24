import {
  type Agent,
  AgentEventTypes,
  type AgentMessageReceivedEvent,
  type DidCommMimeType,
  type InboundTransport,
  TransportService,
} from '@credo-ts/core'
import type { Express } from 'express'
import express from 'express'
import { SocketDockTransportSession } from './SocketDockTransportSession'

export class SocketDockInboundTransport implements InboundTransport {
  private app: Express
  private activeConnections: Record<string, string> = {}

  public constructor({ app }: { app: Express }) {
    this.app = app

    this.app.use(express.json())
  }

  public async start(agent: Agent) {
    this.app.post('/connect', async (req, res) => {
      agent.config.logger.info('SocketDockInboundTransport.connect')
      const { connection_id: connectionId } = req.body.meta
      if (!connectionId) {
        throw new Error('ConnectionId is not sent from socketDock server')
      }

      const socketId = this.activeConnections[connectionId]
      if (!socketId) {
        this.activeConnections[connectionId] = connectionId
        agent.config.logger.debug(`Saving new socketId : ${connectionId}`)
      }

      try {
        res.status(200).send(`connection with socketId : ${connectionId} added successfully`)
      } catch (error) {
        res.status(500).send('Error sending response to send URL')
      }
    })

    this.app.post('/message', async (req, res) => {
      agent.config.logger.info('SocketDockInboundTransport.message')

      const { connection_id: connectionId } = req.body.meta
      if (!connectionId) {
        throw new Error('ConnectionId is not sent from socketDock server')
      }

      try {
        const socketId = this.activeConnections[connectionId]
        agent.config.logger.debug(`activeConnections transport session : ${socketId} ${connectionId}`)
        const sendUrl = req.body.meta.send
        const requestMimeType = req.headers['content-type'] as DidCommMimeType
        const session = new SocketDockTransportSession(socketId, res, sendUrl, requestMimeType)
        const message = req.body.message
        const encryptedMessage = JSON.parse(message)

        agent.config.logger.debug(`Session value for transport session : ${session.id}`)

        agent.events.emit<AgentMessageReceivedEvent>(agent.context, {
          type: AgentEventTypes.AgentMessageReceived,
          payload: {
            message: encryptedMessage,
            session: session,
          },
        })
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).send('Error processing message')
        }
      }
    })

    this.app.post('/disconnect', async (req, res) => {
      agent.config.logger.info('SocketDockInboundTransport.disconnect')
      const transportService = agent.dependencyManager.resolve(TransportService)
      const { connection_id } = req.body
      if (!connection_id) {
        throw new Error('ConnectionId is not sent from socketDock server')
      }

      delete this.activeConnections[connection_id]
      const session = transportService.findSessionById(connection_id)
      agent.config.logger.debug(`Got session from transportService ${session?.id}`)
      if (session) {
        transportService.removeSession(session)
      }

      agent.config.logger.debug(`removed mapping of socketId : ${connection_id}`)
      res.status(200).send(`Mapping with socketId : ${connection_id} removed successfully`)
    })
  }

  public async stop(): Promise<void> {}
}
