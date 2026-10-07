import { CASES, planLanes } from '@conformance/cases'
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import api from '../src/index'
import { RUNS_ALLOWED } from '../src/runs'
import { SWEEP_BATCH } from '../src/sweeper'
import {
  apiEnv,
  balances,
  callApi,
  createRun,
  driveLane,
  migrateAll,
  next,
  startSession,
  type NextAnswer,
} from './helpers'

beforeAll(migrateAll)

type RunView = {
  id: string
  version: string
  finishedAt: string | null
  lanes: {
    lane: string
    cases: string[]
    position: number
    done: boolean
    restore: { status: string } | null
  }[]
  results: { caseId: string; status: string }[]
}

async function newRun(version = 'correct', services?: string[]) {
  const { cookie, body: session } = await startSession()
  const response = await createRun(cookie, { version, ...(services ? { services } : {}) })
  expect(response.status).toBe(201)
  return { cookie, session, run: await response.json<RunView>() }
}

const sessionId = async (tenant: string) =>
  (await env.DB.prepare('SELECT id FROM sessions WHERE tenant = ?')
    .bind(tenant)
    .first<{ id: string }>())!.id

describe('POST /runs', () => {
  it('plans a read lane and a lane per member, from the cases and nothing else', async () => {
    const { run } = await newRun()
    const lanes = planLanes(CASES)
    expect(run.lanes.map((l) => [l.lane, l.cases])).toEqual([
      ['A', lanes.members.A.map((c) => c.id)],
      ['B', lanes.members.B.map((c) => c.id)],
      ['read', lanes.readOnly.map((c) => c.id)],
    ])
  })

  it('plans only the services chosen, and leaves out a lane with nothing in it', async () => {
    const { run } = await newRun('correct', ['earn'])
    expect(run.lanes.map((l) => l.lane)).toEqual(['A', 'read'])
    expect(run.lanes.flatMap((l) => l.cases).every((id) => id.startsWith('earn/'))).toBe(true)
  })

  it('refuses a version not on the list — including ones shaped like paths and URLs', async () => {
    const { cookie } = await startSession()
    for (const version of [
      'nope',
      '../correct',
      'correct/../../x',
      'https://attacker.example',
      7,
    ]) {
      const response = await createRun(cookie, { version })
      expect({ version, status: response.status }).toEqual({ version, status: 400 })
    }
  })

  it('refuses an unknown service, or none', async () => {
    const { cookie } = await startSession()
    expect((await createRun(cookie, { version: 'correct', services: ['refunds'] })).status).toBe(
      400,
    )
    expect((await createRun(cookie, { version: 'correct', services: [] })).status).toBe(400)
  })

  it('needs a session', async () => {
    const response = await callApi('/runs', { method: 'POST', body: '{"version":"correct"}' })
    expect(response.status).toBe(401)
  })

  it('stops a session at its limit, even when the presses arrive together', async () => {
    const { cookie } = await startSession()
    const statuses = await Promise.all(
      Array.from({ length: RUNS_ALLOWED + 4 }, () =>
        createRun(cookie, { version: 'correct', services: ['member'] }).then((r) => r.status),
      ),
    )
    expect(statuses.filter((s) => s === 201)).toHaveLength(RUNS_ALLOWED)
    expect(statuses.filter((s) => s === 429)).toHaveLength(4)
  })
})

describe('a whole run against the correct partner', () => {
  it('passes every case, gives both members their points back, and finishes', async () => {
    const { cookie, session, run } = await newRun()
    await Promise.all(run.lanes.map((l) => driveLane(cookie, run.id, l.lane)))

    const view = await (await callApi(`/runs/${run.id}`, { headers: { cookie } })).json<RunView>()
    expect(view.results).toHaveLength(CASES.length)
    expect(view.results.filter((r) => r.status !== 'passed')).toEqual([])
    expect(view.lanes.filter((l) => l.lane !== 'read').map((l) => l.restore?.status)).toEqual([
      'restored',
      'restored',
    ])
    expect(view.finishedAt).not.toBeNull()
    expect(await balances(cookie)).toEqual([1000, 1000])
    const owed = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM member_baselines WHERE session_id = ?',
    )
      .bind(await sessionId(session.partner.tenant))
      .first<{ n: number }>()
    expect(owed!.n).toBe(0)
  })
})

describe('POST /runs/:id/lanes/:lane/next', () => {
  it('does not call a run finished while one of its lanes is still going', async () => {
    const { cookie, run } = await newRun()
    await driveLane(cookie, run.id, 'read')
    await driveLane(cookie, run.id, 'A')
    const view = await (await callApi(`/runs/${run.id}`, { headers: { cookie } })).json<RunView>()
    expect(view.finishedAt).toBeNull()
    await driveLane(cookie, run.id, 'B')
    const done = await (await callApi(`/runs/${run.id}`, { headers: { cookie } })).json<RunView>()
    expect(done.finishedAt).not.toBeNull()
  })

  it('runs one case per call, in the planned order', async () => {
    const { cookie, run } = await newRun()
    const read = run.lanes.find((l) => l.lane === 'read')!
    const first = await (await next(cookie, run.id, 'read')).json<NextAnswer>()
    const second = await (await next(cookie, run.id, 'read')).json<NextAnswer>()
    expect([first.result!.caseId, second.result!.caseId]).toEqual(read.cases.slice(0, 2))
    expect([first.position, second.position]).toEqual([1, 2])
  })

  it('lets only one of two calls on the same lane run the case', async () => {
    const { cookie, run } = await newRun()
    const responses = await Promise.all([next(cookie, run.id, 'A'), next(cookie, run.id, 'A')])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const view = await (await callApi(`/runs/${run.id}`, { headers: { cookie } })).json<RunView>()
    expect(view.lanes.find((l) => l.lane === 'A')!.position).toBe(1)
    expect(view.results).toHaveLength(1)
  })

  it('picks a lane back up, and runs the same case again, once a dead call’s claim lapses', async () => {
    const { cookie, run } = await newRun()
    // A call that claimed the lane and never came back.
    await env.DB.prepare('UPDATE run_lanes SET busy_until = ? WHERE run_id = ? AND lane = ?')
      .bind(Math.floor(Date.now() / 1000) + 60, run.id, 'read')
      .run()
    expect((await next(cookie, run.id, 'read')).status).toBe(409)

    await env.DB.prepare('UPDATE run_lanes SET busy_until = ? WHERE run_id = ? AND lane = ?')
      .bind(Math.floor(Date.now() / 1000) - 1, run.id, 'read')
      .run()
    const answer = await (await next(cookie, run.id, 'read')).json<NextAnswer>()
    expect(answer.result!.caseId).toBe(run.lanes.find((l) => l.lane === 'read')!.cases[0])
  })

  it('makes a second run wait for a member the first run holds, and then lets it through', async () => {
    const { cookie } = await startSession()
    const first = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    const second = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()

    expect((await next(cookie, first.id, 'A')).status).toBe(200)
    const waiting = await next(cookie, second.id, 'A')
    expect(waiting.status).toBe(423)
    expect(waiting.headers.get('retry-after')).toBe('5')

    await driveLane(cookie, first.id, 'A')
    expect((await next(cookie, second.id, 'A')).status).toBe(200)
  })

  it('lets a run take a member whose holder’s lock has lapsed', async () => {
    const { cookie } = await startSession()
    const first = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    const second = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    await next(cookie, first.id, 'A')
    await env.DB.prepare('UPDATE member_locks SET expires_at = 0 WHERE holder = ?')
      .bind(first.id)
      .run()
    expect((await next(cookie, second.id, 'A')).status).toBe(200)
  })

  it('answers 404 for another session’s run, and for a lane the run does not have', async () => {
    const mine = await newRun('correct', ['earn'])
    const theirs = await startSession()
    expect((await next(theirs.cookie, mine.run.id, 'A')).status).toBe(404)
    expect(
      (await callApi(`/runs/${mine.run.id}`, { headers: { cookie: theirs.cookie } })).status,
    ).toBe(404)
    expect((await next(mine.cookie, mine.run.id, 'B')).status).toBe(404)
    expect((await next(mine.cookie, mine.run.id, 'C')).status).toBe(404)
    const listed = await (
      await callApi('/runs', { headers: { cookie: theirs.cookie } })
    ).json<unknown[]>()
    expect(listed).toEqual([])
  })

  it('ignores anything the browser sends with next', async () => {
    const { cookie, run } = await newRun('correct', ['earn'])
    const response = await callApi(`/runs/${run.id}/lanes/A/next`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        caseId: 'earn/unknown-member',
        baseUrl: 'https://attacker.example',
        points: 1e6,
      }),
    })
    const answer = await response.json<NextAnswer>()
    expect(answer.result!.caseId).toBe(run.lanes.find((l) => l.lane === 'A')!.cases[0])
  })
})

describe('giving points back', () => {
  it('keeps the debt when a restore cannot reach it, and pays it on a later run', async () => {
    const { cookie } = await startSession()
    // off-by-one moves one point fewer than asked, so its own restore lands short.
    const crooked = await (
      await createRun(cookie, { version: 'off-by-one', services: ['earn'] })
    ).json<RunView>()
    const answers = await driveLane(cookie, crooked.id, 'A')
    expect(answers.at(-1)!.restore!.status).toBe('not-restored')
    expect((await balances(cookie))[0]).not.toBe(1000)

    const straight = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    const after = await driveLane(cookie, straight.id, 'A')
    expect(after.at(-1)!.restore).toMatchObject({ status: 'restored', target: 1000 })
    expect((await balances(cookie))[0]).toBe(1000)
  })

  it('writes the balance owed before the first case moves anything', async () => {
    const { cookie, body: session } = await startSession()
    const run = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    await next(cookie, run.id, 'A')
    const owed = await env.DB.prepare(
      'SELECT target FROM member_baselines WHERE session_id = ? AND slot = ?',
    )
      .bind(await sessionId(session.partner.tenant), 'A')
      .first<{ target: number }>()
    expect(owed!.target).toBe(1000)
    expect((await balances(cookie))[0]).not.toBe(1000)
  })

  it('does not let a later run overwrite a debt that is still owed', async () => {
    const { cookie, body: session } = await startSession()
    const id = await sessionId(session.partner.tenant)
    const first = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    await next(cookie, first.id, 'A') // moves points, then is abandoned
    await env.DB.prepare('UPDATE member_locks SET expires_at = 0 WHERE session_id = ?')
      .bind(id)
      .run()

    const second = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    await driveLane(cookie, second.id, 'A')
    expect((await balances(cookie))[0]).toBe(1000)
  })
})

describe('the sweep', () => {
  // A sweep takes a bounded batch of whatever is owed, so debts left behind by
  // other tests would change who is in it. Each test here starts from none.
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM sessions').run()
  })

  const runSweep = async () => {
    const ctx = createExecutionContext()
    await api.scheduled(createScheduledController(), apiEnv(), ctx)
    await waitOnExecutionContext(ctx)
  }

  it('pays a debt left by a run nobody finished, once its lock has lapsed', async () => {
    const { cookie, body: session } = await startSession()
    const id = await sessionId(session.partner.tenant)
    const run = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    await next(cookie, run.id, 'A')
    expect((await balances(cookie))[0]).not.toBe(1000)

    await runSweep() // the run still holds the member
    expect((await balances(cookie))[0]).not.toBe(1000)

    await env.DB.prepare('UPDATE member_locks SET expires_at = 0 WHERE session_id = ?')
      .bind(id)
      .run()
    await runSweep()
    expect((await balances(cookie))[0]).toBe(1000)
    const owed = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM member_baselines WHERE session_id = ?',
    )
      .bind(id)
      .first<{ n: number }>()
    expect(owed!.n).toBe(0)
  })

  it('restores through the version the member was last used with, not the first', async () => {
    const { cookie, body: session } = await startSession()
    const id = await sessionId(session.partner.tenant)
    const lapse = () =>
      env.DB.prepare('UPDATE member_locks SET expires_at = 0 WHERE session_id = ?').bind(id).run()

    // Left owing by a version whose restore would land one short…
    const crooked = await (
      await createRun(cookie, { version: 'off-by-one', services: ['earn'] })
    ).json<RunView>()
    await next(cookie, crooked.id, 'A')
    await lapse()
    // …then taken, and also abandoned, by a run against the correct one.
    const straight = await (
      await createRun(cookie, { version: 'correct', services: ['earn'] })
    ).json<RunView>()
    await next(cookie, straight.id, 'A')
    await lapse()

    await runSweep()
    expect((await balances(cookie))[0]).toBe(1000)
  })

  /**
   * A sweep takes SWEEP_BATCH rows, and a row it cannot pay stays where it was.
   * Taken oldest-first every time, a full batch of those is the whole sweep for
   * as long as they last, and a newer debt that could be paid never is.
   */
  describe('with more rows it cannot pay than a batch holds', () => {
    const lapseAll = () => env.DB.prepare('UPDATE member_locks SET expires_at = 0').run()
    const olderThanTheRest = (id: string) =>
      env.DB.prepare('UPDATE member_baselines SET recorded_at = 1 WHERE session_id = ?')
        .bind(id)
        .run()

    async function owing(version: string, services = ['earn']) {
      const { cookie, body: session } = await startSession()
      const id = await sessionId(session.partner.tenant)
      const run = await (await createRun(cookie, { version, services })).json<RunView>()
      await next(cookie, run.id, 'A')
      return { cookie, id }
    }

    const baselinesOf = async (id: string) =>
      (await env.DB.prepare('SELECT COUNT(*) AS n FROM member_baselines WHERE session_id = ?')
        .bind(id)
        .first<{ n: number }>())!.n

    it('still pays a newer debt that can be paid, within two sweeps', async () => {
      // Each of these restores one point short, so none is ever paid.
      for (let i = 0; i < SWEEP_BATCH; i++) await olderThanTheRest((await owing('off-by-one')).id)
      const payable = await owing('correct')
      await lapseAll()

      await runSweep()
      await runSweep()

      expect((await balances(payable.cookie))[0]).toBe(1000)
      expect(await baselinesOf(payable.id)).toBe(0)
    })

    it('does not let rows another run still holds use up the batch either', async () => {
      // Held by runs that are still going: the sweep must leave them alone.
      for (let i = 0; i < SWEEP_BATCH; i++) await olderThanTheRest((await owing('correct')).id)
      const payable = await owing('correct')
      await env.DB.prepare('UPDATE member_locks SET expires_at = 0 WHERE session_id = ?')
        .bind(payable.id)
        .run()

      await runSweep()
      await runSweep()

      expect((await balances(payable.cookie))[0]).toBe(1000)
    })
  })

  it('deletes sessions that have ended, with their runs', async () => {
    const { cookie, body: session } = await startSession()
    const id = await sessionId(session.partner.tenant)
    const run = await (
      await createRun(cookie, { version: 'correct', services: ['member'] })
    ).json<RunView>()
    await env.DB.prepare('UPDATE sessions SET expires_at = 0 WHERE id = ?').bind(id).run()
    await runSweep()
    const left = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM sessions WHERE id = ?1) + (SELECT COUNT(*) FROM runs WHERE id = ?2) AS n',
    )
      .bind(id, run.id)
      .first<{ n: number }>()
    expect(left!.n).toBe(0)
  })
})
