-- A run: one press of Run, against one version of the partner.
CREATE TABLE runs (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  services     TEXT NOT NULL,           -- JSON array of the services chosen
  created_at   INTEGER NOT NULL,
  finished_at  INTEGER
);
CREATE INDEX runs_by_session ON runs (session_id, created_at);

-- A lane: the cases one queue runs, in order, and how far it has got. `read`
-- is the cases that change no balance; `A` and `B` are each member's writing
-- cases, which must not run alongside anything else that moves that member.
CREATE TABLE run_lanes (
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  lane        TEXT NOT NULL CHECK (lane IN ('read', 'A', 'B')),
  case_ids    TEXT NOT NULL,            -- JSON array, in the order they run
  position    INTEGER NOT NULL DEFAULT 0,
  -- A `next` holds the lane until this time. Expires, so a request that died
  -- mid-case does not hold the lane for ever; the case is then run again.
  busy_until  INTEGER,
  -- What restoring the member's balance came to, for the member lanes.
  restore     TEXT,
  done        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, lane)
);

CREATE TABLE run_results (
  run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  case_id      TEXT NOT NULL,
  lane         TEXT NOT NULL,
  status       TEXT NOT NULL,
  result       TEXT NOT NULL,           -- JSON, the runner's CaseResult
  finished_at  INTEGER NOT NULL,
  PRIMARY KEY (run_id, case_id)
);

-- Who may move a member's balance right now. One holder per member; the lease
-- is renewed by every `next` and expires, so a closed tab or a dead Worker
-- gives the member back on its own.
CREATE TABLE member_locks (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL CHECK (slot IN ('A', 'B')),
  holder      TEXT NOT NULL,            -- a run id, or 'sweeper'
  expires_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, slot)
);

-- The balance a member is owed back. Written when a lane first takes the
-- member and finds none, never overwritten, and deleted only by a restore
-- that reaches it. Its existence is the pending work: whoever holds the
-- member next — a later run, or the cron sweeper — finishes it.
CREATE TABLE member_baselines (
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  slot         TEXT NOT NULL CHECK (slot IN ('A', 'B')),
  target       INTEGER NOT NULL,
  -- The partner version to restore through when no run is doing it: the one
  -- the member was last used with.
  version      TEXT NOT NULL,
  recorded_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, slot)
);
