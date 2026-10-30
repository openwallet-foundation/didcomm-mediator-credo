-- cleanupLiveSessionsAndExit deletes by `instance` on every shutdown; without this index it's a full table scan.
CREATE INDEX IF NOT EXISTS live_session_instance_idx ON live_session (instance);
