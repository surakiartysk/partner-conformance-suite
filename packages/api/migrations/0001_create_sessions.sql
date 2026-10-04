-- A visitor's session: one press of "try it".
--
-- The cookie carries a random token and only its SHA-256 is stored, so a copy
-- of this table is not a set of live cookies. `id` is a separate random value
-- that other tables refer to, so the token itself never travels between rows.
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,
  token_hash          TEXT NOT NULL UNIQUE,
  -- The tenant on the reference partner provisioned for this session.
  tenant              TEXT NOT NULL,
  -- The signing secret shared with that tenant, encrypted (AES-GCM). See
  -- src/secrets.ts — the key is a Worker secret, never in this database.
  secret              TEXT NOT NULL,
  member_a            TEXT NOT NULL,
  member_b            TEXT NOT NULL,
  -- Set the one time the secret is shown.
  secret_revealed_at  INTEGER,
  created_at          INTEGER NOT NULL,
  -- The tenant's own expiry, so a session never outlives its partner.
  expires_at          INTEGER NOT NULL
);

-- Session starts per client address, for the rate limit on "try it". A fixed
-- window: `attempts` counts from `window_start` and resets when it has passed.
CREATE TABLE session_starts (
  client        TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  attempts      INTEGER NOT NULL
);
