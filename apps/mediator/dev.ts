import path from 'node:path'
import { argv } from 'node:process'
import { connect } from '@ngrok/ngrok'
import dotenv from 'dotenv'

const sample = argv[2]

if (sample) {
  console.log(`loading sample samples/${sample}.json`)
  process.env.CONFIG = path.join(__dirname, 'samples', `${sample}.json`)
} else {
  console.log('loading .env.development')
  dotenv.config({
    path: '../../.env.development',
  })
}

if (!process.env.NGROK_AUTH_TOKEN) {
  require('./src/index')
} else {
  console.log('NGROK_AUTH_TOKEN found, connecting to ngrok')

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
