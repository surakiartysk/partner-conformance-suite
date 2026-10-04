-- A tenant is one provisioned copy of the partner: its own signing secret and
-- its own members. The suite's demo gets one per visitor session, so strangers
-- never queue behind each other's locks.
CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  secret      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE members (
  tenant   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id       TEXT NOT NULL,
  name     TEXT NOT NULL,
  tier     TEXT NOT NULL CHECK (tier IN ('standard', 'silver', 'gold')),
  -- No CHECK (balance >= 0) here on purpose: the guard lives in the statement
  -- that moves points, and the variants with a bug need to be able to drop it.
  balance  INTEGER NOT NULL,
  PRIMARY KEY (tenant, id)
);

-- Every movement of points. `reference` is the provider's idempotency key,
-- unique per tenant across all types; `reverses` is unique so a transaction
-- can be reversed once, enforced by the database rather than by a read that
-- two concurrent requests could both pass.
CREATE TABLE transactions (
  tenant         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id             TEXT NOT NULL,
  reference      TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'reversal')),
  member_id      TEXT NOT NULL,
  points         INTEGER NOT NULL CHECK (points > 0),
  balance_after  INTEGER NOT NULL,
  reverses       TEXT,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (tenant, id),
  UNIQUE (tenant, reference),
  UNIQUE (tenant, reverses)
);

-- webhook-ids accepted recently, for refusing a replay.
CREATE TABLE seen_messages (
  tenant   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id       TEXT NOT NULL,
  seen_at  INTEGER NOT NULL,
  PRIMARY KEY (tenant, id)
);
