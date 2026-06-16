import type { WebSocket, WebSocketServer } from 'ws'

interface HeartbeatSocket extends WebSocket {
  __missedPongs?: number
}

// Server-side WebSocket keepalive (ping/pong).
//
// Upstream didcomm-mediator-credo does not ship a heartbeat. Without one, an
// idle live-mode WS to a mobile wallet can be silently dropped by an
// intermediary idle timeout (e.g. an ALB), which tears down the Credo live
// pickup session and forces the next message onto the slow queue+push path.
// Periodic pings keep the connection non-idle; the mark-and-sweep terminates
// sockets that stop answering so dead connections don't linger.
//
// This is protocol-level (ping/pong frames) and transparent to Credo's message
// handling — it never touches application message frames. A two-miss window
// (2 × intervalMs without a pong) avoids terminating slow-but-healthy clients
// on a single transient network hiccup.
//
// Returns a stop function; pass intervalMs <= 0 to disable entirely.
export function startWsHeartbeat(socketServer: WebSocketServer, intervalMs: number): () => void {
  if (!intervalMs || intervalMs <= 0) return () => {}

  socketServer.on('connection', (socket: HeartbeatSocket) => {
    socket.__missedPongs = 0
    socket.on('pong', () => {
      socket.__missedPongs = 0
    })
  })

  const timer = setInterval(() => {
    for (const client of socketServer.clients as Set<HeartbeatSocket>) {
      const missed = client.__missedPongs ?? 0
      if (missed >= 2) {
        client.terminate()
        continue
      }
      // Increment before ping so that if no pong arrives by the next tick,
      // the counter reflects one additional miss.
      client.__missedPongs = missed + 1
      try {
        client.ping()
      } catch {
        // socket already closing — sweep will collect it next tick
      }
    }
  }, intervalMs)
  if (timer.unref) timer.unref()

  return () => clearInterval(timer)
}
