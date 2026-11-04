-- Instance that moved the message to `sending`, so a revert can skip messages
-- another instance is delivering on its own live session.

ALTER TABLE queued_message ADD COLUMN IF NOT EXISTS instance VARCHAR(200);
