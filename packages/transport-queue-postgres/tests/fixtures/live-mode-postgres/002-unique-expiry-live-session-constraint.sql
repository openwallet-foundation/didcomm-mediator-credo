-- 1 Add expires_at column (ephemeral TTL)
ALTER TABLE live_session
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '10 minutes');

-- 2 Add index on connection_id for fast lookups
CREATE INDEX IF NOT EXISTS live_session_connection_id_idx ON live_session (connection_id);

-- 3 Add index on expires_at for fast cleanup
CREATE INDEX IF NOT EXISTS live_session_expires_at_idx ON live_session (expires_at);