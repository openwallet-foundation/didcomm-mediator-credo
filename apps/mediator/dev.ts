import { connect } from '@ngrok/ngrok'
import dotenv from 'dotenv'

dotenv.config({
  path: '../.env.development',
})

if (!process.env.NGROK_AUTH_TOKEN) {
  require('./src/index')
} else {
  const port = process.env.AGENT_PORT ? Number(process.env.AGENT_PORT) : 3110
  /**
   * Connect to ngrok and then set the port and url on the environment before importing
   * the index file.
   */
  connect({
    port,
    authtoken: process.env.NGROK_AUTH_TOKEN,
  }).then((app) => {
    console.log('Got ngrok url:', app.url())
    const url = app.url()

    process.env.AGENT_ENDPOINTS = `${url},${url?.replace('http', 'ws')}`
    process.env.SHORTENER_BASE_URL = `${url}/s`

    require('./src/index')
  })
}
