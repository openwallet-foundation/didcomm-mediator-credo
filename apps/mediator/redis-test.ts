import Redis from 'ioredis'
import { RedisStreamMessagePublishing } from './src/multi-instance/redis-stream-message-publishing/redisStreamMessagePublishing'

const client = new Redis('redis://127.0.0.1:6379')
const serverId1 = 'server-1'
const serverId2 = 'server-2'

async function run() {
  const streamPublishing1 = new RedisStreamMessagePublishing(client, serverId1)
  const streamPublishing2 = new RedisStreamMessagePublishing(client, serverId2)

  await streamPublishing1.registerConnection('1')
  await streamPublishing1.registerConnection('2')
  await streamPublishing2.registerConnection('3')

  void streamPublishing1.listenForMessages(async (message) => {
    console.log('handling message on server 1', message)
    throw new Error('uh oh')
  })
  // streamPublishing1.claimingPendingMessages()
  void streamPublishing2.listenForMessages(async (message) => {
    console.log('handling message on server 2', message)
  })

  void streamPublishing1.claimPendingMessages(async (message) => {
    console.log('claiming failed message on server 1', message)
  })

  void streamPublishing2.claimPendingMessages(async (message) => {
    console.log('claiming failed message on server 2', message)
  })

  const connectionServer2 = await streamPublishing1.getConnectionServer('3')
  const connectionServer1 = await streamPublishing1.getConnectionServer('2')
  if (connectionServer2) {
    console.log('sending message to server 2', connectionServer2)
    await streamPublishing1.sendMessageToServer(connectionServer2, { hey: 'there' })
    await streamPublishing1.sendMessageToServer(connectionServer2, { hey: 'there2' })
    await streamPublishing1.sendMessageToServer(connectionServer2, { hey: 'there3' })
  }
  if (connectionServer1) {
    console.log('sending message to server 1', connectionServer2)
    await streamPublishing1.sendMessageToServer(connectionServer1, { hey: 'there1111' })
  }
}

run()
