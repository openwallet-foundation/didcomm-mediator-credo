export const messagesTableName = 'queuedmessage'

export const message_state_type = `CREATE TYPE message_state AS ENUM ('pending', 'sending');`

export const createTableMessage = `
CREATE TABLE IF NOT EXISTS ${messagesTableName} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connectionId VARCHAR(255),
  recipientKeysBase58 TEXT[],
  encryptedMessage JSONB,
  state message_state NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

export const liveSessionTableName = 'livesession'

export const createTableLive = `
CREATE TABLE IF NOT EXISTS ${liveSessionTableName} (
  sessionid VARCHAR(255) PRIMARY KEY,
  connectionid VARCHAR(50),
  protocolVersion VARCHAR(50),
  role VARCHAR(50),
  instance VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`

export const messageTableIndex = `CREATE INDEX IF NOT EXISTS "${messagesTableName}_connectionId_index" ON "${messagesTableName}" (connectionId);`

export const liveSessionTableIndex = `CREATE INDEX IF NOT EXISTS "${liveSessionTableName}_connectionid" ON "${liveSessionTableName}" USING btree ("connectionid");`
