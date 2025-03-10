export const messagesTableName = 'queued_message'

export const createTypeMessageState = `CREATE TYPE message_state AS ENUM ('pending', 'sending');`

export const createTableMessage = `
CREATE TABLE IF NOT EXISTS ${messagesTableName} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id VARCHAR(255),
  recipient_dids TEXT[],
  encrypted_message JSONB,
  state message_state NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

export const liveSessionTableName = 'live_session'

export const createTableLive = `
CREATE TABLE IF NOT EXISTS ${liveSessionTableName} (
  session_id VARCHAR(255) PRIMARY KEY,
  connection_id VARCHAR(50),
  protocol_version VARCHAR(50),
  role VARCHAR(50),
  instance VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

export const messageTableIndex = `CREATE INDEX IF NOT EXISTS "${messagesTableName}_connection_id_idx" ON "${messagesTableName}" (connection_id);`

export const liveSessionTableIndex = `CREATE INDEX IF NOT EXISTS "${liveSessionTableName}_connection_id_idx" ON "${liveSessionTableName}" USING btree (connection_id);`
