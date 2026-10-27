-- Databases created by the v0.5.x pickup repository (live-mode-postgres) recorded different
-- migrations as 002-004, so ours were skipped there. This repeats ours idempotently.

CREATE TABLE IF NOT EXISTS instance (
  name VARCHAR(200) PRIMARY KEY,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instance_last_seen_idx ON instance (last_seen);

ALTER TABLE queued_message ADD COLUMN IF NOT EXISTS instance VARCHAR(200);
ALTER TABLE queued_message ADD COLUMN IF NOT EXISTS sending_since TIMESTAMPTZ;
ALTER TABLE queued_message ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

UPDATE queued_message SET sending_since = now() WHERE state = 'sending' AND sending_since IS NULL;

-- The reaper and shutdown delete live_session rows by instance.
CREATE INDEX IF NOT EXISTS live_session_instance_idx ON live_session (instance);
