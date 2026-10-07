# Architecture

How the pieces fit, as built. What is planned and not built is at the end, and
says so.

## The pieces

```
                 ┌──────────────────────────────┐
                 │  Browser                      │
                 │  "try it" · Run · next        │
                 │  sends a run id and a lane,   │
                 │  nothing else                 │
                 └──────────────┬───────────────┘
                                │ HTTPS + session cookie
                                ▼
┌──────────────────────────────────────────────────────────┐
│  API Worker — packages/api (Hono)                         │
│                                                           │
│  sessions ── runs ── lanes (/next) ── locks ── restore    │
│                         │                                 │
│        cases ───────────┤  picks the next case itself     │
│        matchers ────────┤  judges the answer itself       │
│        signer ──────────┘  signs every request itself     │
│                                                           │
│  cron, every 10 min: restore what is owed, end sessions   │
└───────┬──────────────────────────────────┬───────────────┘
        │                                  │ signed HTTPS, through a service binding
        ▼                                  ▼
┌────────────────────┐   ┌──────────────────────────────────────────────┐
│ D1: the suite's    │   │ Reference partner — packages/partner (Hono)  │
│ sessions           │   │                                              │
│ runs, lanes,       │   │ /{version}/{tenant}/members/…   ← the spec   │
│   results          │   │ /{version}/{tenant}/points/…    ← the spec   │
│ member locks       │   │ /_provision                     ← not        │
│ member baselines   │   │                                              │
│ (secrets sealed)   │   │ its own verifier; thirteen versions          │
└────────────────────┘   └───────────────────────┬──────────────────────┘
                                                 ▼
                               ┌──────────────────────────────────────┐
                               │ D1: the partner's                     │
                               │ tenants, members, transactions,       │
                               │ seen webhook-ids                      │
                               └──────────────────────────────────────┘
```

| Package            | What it is                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `packages/spec`    | The Points Partner API in OpenAPI 3.1 — the contract a partner implements.                                      |
| `packages/cases`   | The twenty cases, their matchers, and how they are split into lanes. Pure TypeScript; no I/O.                   |
| `packages/api`     | The provider's Worker: sessions, runs, lanes, locks, restores, the sweep, and the runner and signer.            |
| `packages/partner` | A partner, to run against: the spec implemented correctly, plus twelve versions that are each wrong in one way. |

The two Workers share no code and no database. The suite's signer and the
partner's verifier are separate implementations, each held to the test vector
Standard Webhooks publishes ([decision 7](decisions.md#7-the-partners-verifier-is-pinned-to-the-standard-not-to-our-signer)).

## The three connections

1. **Browser → API.** The browser presses buttons and names things: a version
   from a closed list, a set of services, a run id, a lane. Where requests go,
   what they carry, and whether the answer passes are decided by the server.
2. **API → partner.** The only connection between the two sides: HTTPS,
   signed, through a service binding. The partner's base URL is built from the
   deployment's `PARTNER_ORIGIN`, the version and the session's tenant — never
   from a request.
3. **API → `/_provision`.** Once per "try it", with an operator token: a new
   tenant on the partner, a signing secret, two members of 1,000 points.

## One run

1. **Try it.** `POST /api/sessions` provisions a tenant, seals the signing secret
   with AES-GCM, and sets an `HttpOnly` cookie whose token is stored only as a
   hash ([decision 21](decisions.md#21-a-session-is-a-cookie-nobody-stores-and-a-secret-nobody-stores-in-the-clear)).
2. **Run.** `POST /api/runs` plans the chosen cases into up to three lanes: `read`
   for cases that move no balance, `A` and `B` for each member's writing cases.
3. **Next, per lane.** The browser calls `next` on each lane until it is done.
   Each call claims the lane, and in a member lane takes the member's lock and
   makes sure a baseline exists; then it runs one case — build, sign, send,
   judge, store.
4. **Give it back.** The last call of a member lane restores the member to its
   baseline, through the partner's API, and lets the member go.

## When something goes wrong

| What happens                            | What the system does                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Two tabs press `next` on the same lane  | The lane claim is a conditional `UPDATE`; one runs the case, the other gets `409`.                   |
| A `next` dies mid-case                  | Its claim lapses after two minutes; the next call runs the same case again.                          |
| A second run wants a member a run holds | `423` with `Retry-After`; the lock is the holder's until it ends the lane or the lease lapses.       |
| The tab is closed mid-run               | The run stops. The member's lock lapses after five minutes; its baseline stays.                      |
| A restore cannot reach the target       | The baseline stays, and the next holder of the member pays it.                                       |
| Nobody comes back                       | The cron sweep restores owed members it can lock, twenty a sweep, least recently tried first.        |
| The partner does not answer in time     | The case is `timed_out`, wherever the wait was — act, verify, or setup.                              |
| The session ends                        | The sweep deletes it, with its runs, locks and baselines; the partner's own cron removes its tenant. |

## Data

**The suite's D1** — `sessions` (token hash, tenant, sealed secret, members),
`session_starts` (the "try it" limit, cleared by the sweep once its window has passed), `runs`, `run_lanes` (cases, position,
claim, restore outcome), `run_results` (each case's full result), `member_locks`
and `member_baselines`. Every read of a run is scoped to the session in SQL.

**The partner's D1** — `tenants`, `members`, `transactions` (unique on
reference, unique on what a reversal reverses) and `seen_messages` (webhook-ids,
remembered for twice the timestamp tolerance). The partner has a cron of its own,
every ten minutes: it deletes tenants that have expired, with everything under
them, and ids older than the memory window ([decision 26](decisions.md#26-the-partner-forgets-what-has-expired-on-a-cron-of-its-own)).

## Not built yet

- **Most of the page.** Home (starts a session) and Connection (the partner's
  address, the signing secret once, the members' balances) exist. Choosing a
  version and services, the lanes running, the verdicts and the history do not.
  Stage 5.
- **Testing a partner of your own.** The design has a self-hosted mode in which
  a partner enters its own base URL, behind a guard against server-side request
  forgery. The deployed suite only ever tests the reference partner; nothing
  that takes a URL exists.
- **Rotating a signing secret.** Standard Webhooks allows several signatures in
  one header for exactly this, and the partner's verifier already accepts any
  of them. Nothing on the suite's side signs with two.
- **A partner calling back.** Every case is a request from the suite and its
  answer. Cases in which a partner must call the provider later are not
  modelled.
