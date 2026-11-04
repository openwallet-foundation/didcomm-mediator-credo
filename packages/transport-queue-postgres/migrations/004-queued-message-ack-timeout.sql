-- When a message last moved to `sending` and how many times it did, so the reaper
-- can move messages that were never acknowledged back to `pending`.

ALTER TABLE queued_message ADD COLUMN IF NOT EXISTS sending_since TIMESTAMPTZ;
ALTER TABLE queued_message ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- Messages already stuck in `sending` get a full ack timeout from now and are then delivered again.
UPDATE queued_message SET sending_since = now() WHERE state = 'sending' AND sending_since IS NULL;
