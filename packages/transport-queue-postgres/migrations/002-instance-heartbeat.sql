-- Track live mediator instances via periodic heartbeats so that `live_session`
-- rows left behind by crashed, OOM-killed or scaled-down instances can be
-- reaped proactively by the surviving instances. Without this table,
-- `live_session` rows owned by a dead instance would remain indefinitely and
-- cause forwarded messages to be emitted with a stale `session` (suppressing
-- push notifications) while no instance is able to actually deliver them.

CREATE TABLE IF NOT EXISTS instance (
  name VARCHAR(200) PRIMARY KEY,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instance_last_seen_idx ON instance (last_seen);
