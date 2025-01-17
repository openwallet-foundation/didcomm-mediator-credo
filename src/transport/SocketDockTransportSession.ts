import { type AgentContext, DidCommMimeType, type EncryptedMessage, type TransportSession } from '@credo-ts/core'
import { CredoError } from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import type { Response } from 'express'

export const supportedContentTypes: string[] = [DidCommMimeType.V0, DidCommMimeType.V1]

export class SocketDockTransportSession implements TransportSession {
  public id: string
  public readonly type = 'socketdock'
  public res: Response
  public sendUrl: string
  public requestMimeType: DidCommMimeType

  public constructor(id: string, res: Response, sendUrl: string, requestMimeType: DidCommMimeType) {
    this.id = id
    this.res = res
    this.sendUrl = sendUrl
    this.requestMimeType = requestMimeType
  }

  public async close() {
    if (!this.res.headersSent) {
      this.res.status(200).end()
    }
  }

  public async send(agentContext: AgentContext, encryptedMessage: EncryptedMessage): Promise<void> {
    if (this.res.headersSent) {
      throw new CredoError(`${this.type} transport session has been closed.`)
    }

    // By default we take the agent config's default DIDComm content-type
    let responseMimeType = agentContext.config.didCommMimeType

    if (this.requestMimeType && supportedContentTypes.includes(this.requestMimeType)) {
      responseMimeType = this.requestMimeType
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': responseMimeType,
      },
      body: JSON.stringify(encryptedMessage),
    }
    await agentDependencies.fetch(this.sendUrl, requestOptions)
  }
}
