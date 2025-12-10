// This file contains a very simple round-robin proxy which you can use for testing multi-instance
// message delivery. It will use the targets in round-robin style. It will take into account which server
// was used for the initial connection when upgrading a websocket.
// To run:
// - modify the sample you want to use in the samples directory, and set the endpoints to http://localhost:5050
// - start two mediators, e.g. by running `pnpm dev full` twice, using a different port for the mediators.
// - update the targets in this file to match the ports of the mediators
// - use a mediator client to test it

import http from 'node:http'
import httpProxy from 'http-proxy'

const proxy = httpProxy.createProxyServer({})

const targets = ['http://localhost:3110', 'http://localhost:3111']

let nextTargetIndex = 0

// Map to track which target each socket should use
const socketTargets = new WeakMap()

const getNextTarget = () => {
  const target = targets[nextTargetIndex]
  nextTargetIndex = (nextTargetIndex + 1) % targets.length
  return target
}

const server = http.createServer((req, res) => {
  const target = getNextTarget()

  // Store the target for this socket so WebSocket upgrades use the same target
  socketTargets.set(req.socket, target)

  proxy.web(req, res, { target })
})

server.on('upgrade', (req, socket, head) => {
  // Use the same target that was used for the initial HTTP request
  const target = socketTargets.get(socket) || getNextTarget()

  proxy.ws(req, socket, head, { target })
})

console.log('listening on port 5050')
server.listen(5050)
