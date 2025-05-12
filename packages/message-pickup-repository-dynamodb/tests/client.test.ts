import { QueuedMessagesService } from '../src/client'

void (async () => {
  const client = await QueuedMessagesService.initialize({region: 'local',endpoint: 'http://localhost:8000',credentials: {accessKeyId: 'test',secretAccessKey: 'test'}  })
  const connectionId = 'uuid'
  await client.addMessage({connectionId,payload: {ciphertext: 'a',iv: 'a',protected: 'a',tag: 'a'},recipientDids: ['a'],messageId: 'a'})
  await client.addMessage({connectionId,payload: {ciphertext: 'a',iv: 'a',protected: 'a',tag: 'a'},recipientDids: ['a'],messageId: 'b'})
  const count = await client.getEntriesCount(connectionId)
  console.log(count)
  await client.removeMessages({connectionId, messageIds: ['a','b']})
  const countB = await client.getEntriesCount(connectionId)
  console.log(countB)

  const entries = await client.getEntries(connectionId)
  console.log(entries.length)
  const entriesB = await client.getEntries(connectionId, {deleteMessages: true})
  console.log(entriesB.length)
  const countC = await client.getEntriesCount(connectionId)
  console.log(countC)
})()
