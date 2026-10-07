-- When the sweep last took this debt up, whether or not it could pay it.
-- The sweep takes the least recently attempted first, so a debt it cannot pay
-- goes to the back of the queue instead of being taken again every time and
-- using up the batch. 0 is "never attempted", which sorts before every real
-- time.
ALTER TABLE member_baselines ADD COLUMN last_attempt_at INTEGER NOT NULL DEFAULT 0;
