import {
  CASES,
  planLanes,
  type CaseDefinition,
  type MemberSlot,
  type Service,
} from '@conformance/cases'
import type { Context } from 'hono'
import { acquire, ensureBaseline, release, restore, type Restore } from './members'
import { isPartnerVersion, targetFor, transportFor, type PartnerVersion } from './partner'
import { executeCase } from './runner/execute'
import { randomId } from './secrets'
import type { Env } from './types'

/**
 * Runs, and the lanes a browser drives one case at a time.
 *
 * The browser only ever names a run and a lane. Which case comes next, what is
 * sent, where it goes and what the verdict is are all decided here, so a
 * visitor editing requests in their devtools changes nothing about what the
 * partner receives or how it is judged.
 */

/** Runs one session may start per window. */
export const RUNS_ALLOWED = 20
export const RUN_WINDOW_SECONDS = 60 * 60

/** How long one `next` may hold its lane. A case is at most five requests of ten seconds. */
export const LANE_LEASE_SECONDS = 2 * 60

const LANES = ['read', 'A', 'B'] as const
type Lane = (typeof LANES)[number]

const SERVICES = [...new Set(CASES.map((c) => c.service))]
const BY_ID = new Map(CASES.map((c) => [c.id, c]))

const now = () => Math.floor(Date.now() / 1000)

interface RunRow {
  id: string
  session_id: string
  version: PartnerVersion
  services: string
  created_at: number
  finished_at: number | null
}

interface LaneRow {
  run_id: string
  lane: Lane
  case_ids: string
  position: number
  busy_until: number | null
  restore: string | null
  done: number
}

/** A run, but only if it belongs to the session asking. Every read of a run goes through this. */
async function findRun(c: Context<Env>, id: string): Promise<RunRow | null> {
  return c.env.DB.prepare('SELECT * FROM runs WHERE id = ? AND session_id = ?')
    .bind(id, c.var.session.id)
    .first<RunRow>()
}

export async function createRun(c: Context<Env>): Promise<Response> {
  let body: { version?: unknown; services?: unknown }
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const { version } = body
  if (!isPartnerVersion(version)) return c.json({ error: 'unknown partner version' }, 400)

  const services = body.services ?? SERVICES
  if (
    !Array.isArray(services) ||
    services.length === 0 ||
    !services.every((s) => SERVICES.includes(s as Service))
  ) {
    return c.json({ error: `services must be some of: ${SERVICES.join(', ')}` }, 400)
  }
  const chosen = CASES.filter((definition) => services.includes(definition.service))
  const lanes = planLanes(chosen)
  const plan: [Lane, CaseDefinition[]][] = [
    ['read', lanes.readOnly],
    ['A', lanes.members.A],
    ['B', lanes.members.B],
  ]

  // The count and the insert are one statement, so two Run presses arriving
  // together cannot both see room under the limit.
  const id = randomId('run_')
  const at = now()
  const inserted = await c.env.DB.prepare(
    `INSERT INTO runs (id, session_id, version, services, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5
      WHERE (SELECT COUNT(*) FROM runs WHERE session_id = ?2 AND created_at > ?6) < ?7`,
  )
    .bind(
      id,
      c.var.session.id,
      version,
      JSON.stringify(services),
      at,
      at - RUN_WINDOW_SECONDS,
      RUNS_ALLOWED,
    )
    .run()
  if (inserted.meta.changes === 0) {
    return c.json({ error: 'too many runs in this session; try again later' }, 429)
  }

  await c.env.DB.batch(
    plan
      .filter(([, cases]) => cases.length > 0)
      .map(([lane, cases]) =>
        c.env.DB.prepare('INSERT INTO run_lanes (run_id, lane, case_ids) VALUES (?, ?, ?)').bind(
          id,
          lane,
          JSON.stringify(cases.map((definition) => definition.id)),
        ),
      ),
  )
  return c.json(await runView(c, (await findRun(c, id))!), 201)
}

async function runView(c: Context<Env>, run: RunRow) {
  const lanes = await c.env.DB.prepare('SELECT * FROM run_lanes WHERE run_id = ? ORDER BY lane')
    .bind(run.id)
    .all<LaneRow>()
  const results = await c.env.DB.prepare(
    'SELECT case_id, lane, status, result FROM run_results WHERE run_id = ?',
  )
    .bind(run.id)
    .all<{ case_id: string; lane: Lane; status: string; result: string }>()
  return {
    id: run.id,
    version: run.version,
    services: JSON.parse(run.services) as string[],
    createdAt: new Date(run.created_at * 1000).toISOString(),
    finishedAt: run.finished_at ? new Date(run.finished_at * 1000).toISOString() : null,
    lanes: lanes.results.map((lane) => ({
      lane: lane.lane,
      cases: JSON.parse(lane.case_ids) as string[],
      position: lane.position,
      done: lane.done === 1,
      restore: lane.restore ? (JSON.parse(lane.restore) as Restore) : null,
    })),
    results: results.results.map((r) => ({
      caseId: r.case_id,
      lane: r.lane,
      status: r.status,
      result: JSON.parse(r.result),
    })),
  }
}

export async function getRun(c: Context<Env>): Promise<Response> {
  const run = await findRun(c, c.req.param('id')!)
  if (!run) return c.json({ error: 'no such run' }, 404)
  return c.json(await runView(c, run))
}

export async function listRuns(c: Context<Env>): Promise<Response> {
  const runs = await c.env.DB.prepare(
    'SELECT id, version, created_at, finished_at FROM runs WHERE session_id = ? ORDER BY created_at DESC',
  )
    .bind(c.var.session.id)
    .all<{ id: string; version: string; created_at: number; finished_at: number | null }>()
  return c.json(
    runs.results.map((run) => ({
      id: run.id,
      version: run.version,
      createdAt: new Date(run.created_at * 1000).toISOString(),
      finished: run.finished_at !== null,
    })),
  )
}

/**
 * One step of one lane: the next case, or — once the cases are done — the
 * restore of the lane's member.
 *
 * The lane is claimed with a conditional UPDATE before anything runs, so two
 * tabs calling `next` on the same lane cannot run the same case twice; the
 * slower one is told the lane is busy. The claim expires, so a request that
 * died mid-case leaves the lane to be picked up again, and that case is run
 * again from the start.
 */
export async function next(c: Context<Env>): Promise<Response> {
  const run = await findRun(c, c.req.param('id')!)
  const lane = c.req.param('lane') as Lane
  if (!run || !LANES.includes(lane)) return c.json({ error: 'no such lane' }, 404)

  const row = await c.env.DB.prepare('SELECT * FROM run_lanes WHERE run_id = ? AND lane = ?')
    .bind(run.id, lane)
    .first<LaneRow>()
  if (!row) return c.json({ error: 'no such lane' }, 404)
  if (row.done) return c.json({ lane, done: true })

  const at = now()
  const claimed = await c.env.DB.prepare(
    `UPDATE run_lanes SET busy_until = ?1
      WHERE run_id = ?2 AND lane = ?3 AND done = 0 AND position = ?4
        AND (busy_until IS NULL OR busy_until <= ?5)`,
  )
    .bind(at + LANE_LEASE_SECONDS, run.id, lane, row.position, at)
    .run()
  if (claimed.meta.changes === 0) return c.json({ error: 'this lane is busy' }, 409)

  const session = c.var.session
  const unclaim = () =>
    c.env.DB.prepare('UPDATE run_lanes SET busy_until = NULL WHERE run_id = ? AND lane = ?')
      .bind(run.id, lane)
      .run()

  try {
    if (lane !== 'read') {
      const slot = lane as MemberSlot
      if (!(await acquire(c.env.DB, session.id, slot, run.id))) {
        await unclaim()
        c.header('retry-after', '5')
        return c.json({ error: `member ${slot} is in use by another run` }, 423)
      }
      // Before anything moves this member's points, the balance owed back is
      // written down — or found already written by a run that did not finish.
      await ensureBaseline(c.env, session, slot, run.version)
    }

    const caseIds = JSON.parse(row.case_ids) as string[]
    if (row.position < caseIds.length) {
      const definition = BY_ID.get(caseIds[row.position]!)!
      const result = await executeCase(definition, await targetFor(c.env, session, run.version), {
        transport: transportFor(c.env),
      })
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO run_results (run_id, case_id, lane, status, result, finished_at)
           VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (run_id, case_id) DO NOTHING`,
        ).bind(run.id, definition.id, lane, result.status, JSON.stringify(result), now()),
        c.env.DB.prepare(
          `UPDATE run_lanes SET position = position + 1, busy_until = NULL
            WHERE run_id = ? AND lane = ? AND position = ?`,
        ).bind(run.id, lane, row.position),
      ])
      return c.json({
        lane,
        done: false,
        position: row.position + 1,
        total: caseIds.length,
        result,
      })
    }

    // Every case has run. Give the member's points back, then let them go.
    let restored: Restore | null = null
    if (lane !== 'read') {
      const slot = lane as MemberSlot
      restored = await restore(c.env, session, slot, run.version, run.id)
      await release(c.env.DB, session.id, slot, run.id)
    }
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE run_lanes SET done = 1, busy_until = NULL, restore = ? WHERE run_id = ? AND lane = ?',
      ).bind(restored ? JSON.stringify(restored) : null, run.id, lane),
      // In the same batch, after the lane above is marked done: the run is
      // finished when no lane is left.
      c.env.DB.prepare(
        `UPDATE runs SET finished_at = ?1 WHERE id = ?2 AND finished_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM run_lanes WHERE run_id = ?2 AND done = 0)`,
      ).bind(now(), run.id),
    ])
    return c.json({ lane, done: true, restore: restored })
  } catch (error) {
    await unclaim()
    throw error
  }
}
