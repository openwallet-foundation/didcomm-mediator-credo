-- `recipient_dids @> ARRAY[...]` (array containment) can use a GIN index, unlike
-- the previous `= ANY (recipient_dids)` form, which forced a sequential scan.
CREATE INDEX IF NOT EXISTS queued_message_recipient_dids_gin_idx ON queued_message USING GIN (recipient_dids);
