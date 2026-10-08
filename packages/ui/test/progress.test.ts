import { describe, expect, it } from 'vitest'
import type { RunView } from '../src/api'
import {
  applyEvent,
  counts,
  initialProgress,
  isOver,
  pointsGivenBack,
  rows,
  type Progress,
} from '../src/progress'

const run: RunView = {
  id: 'run_1',
  version: 'double-earn',
  services: ['earn'],
  createdAt: '',
  finishedAt: null,
  lanes: [
    { lane: 'read', cases: ['r/1', 'r/2'], position: 0, done: false, restore: null },
    { lane: 'A', cases: ['a/1', 'a/2', 'a/3'], position: 0, done: false, restore: null },
  ],
  results: [],
}

const lane = (p: Progress, name: string) => p.lanes.find((l) => l.lane === name)!
const statuses = (p: Progress, name: string) => rows(lane(p, name)).map((r) => r.status)

describe('the progress of a run', () => {
  it('starts with the first case of each lane running and the rest waiting', () => {
    const p = initialProgress(run)
    expect(statuses(p, 'A')).toEqual(['running', 'waiting', 'waiting'])
    expect(statuses(p, 'read')).toEqual(['running', 'waiting'])
  })

  it('moves the running mark on when a case finishes, and keeps its status and time', () => {
    const p = applyEvent(initialProgress(run), {
      type: 'case',
      lane: 'A',
      caseId: 'a/1',
      status: 'failed',
      durationMs: 41,
    })
    expect(rows(lane(p, 'A'))).toEqual([
      { caseId: 'a/1', status: 'failed', durationMs: 41 },
      { caseId: 'a/2', status: 'running' },
      { caseId: 'a/3', status: 'waiting' },
    ])
  })

  it('changes only the lane the event is about', () => {
    const before = initialProgress(run)
    const after = applyEvent(before, {
      type: 'case',
      lane: 'A',
      caseId: 'a/1',
      status: 'passed',
      durationMs: 1,
    })
    expect(lane(after, 'read')).toBe(lane(before, 'read'))
    expect(before.lanes[1]!.finished).toEqual({}) // and the old state is untouched
  })

  it('shows no case running once the lane is done', () => {
    let p = initialProgress(run)
    for (const id of ['a/1', 'a/2', 'a/3']) {
      p = applyEvent(p, { type: 'case', lane: 'A', caseId: id, status: 'passed', durationMs: 1 })
    }
    p = applyEvent(p, {
      type: 'lane-done',
      lane: 'A',
      restore: { status: 'restored', target: 1000 },
    })
    expect(statuses(p, 'A')).toEqual(['passed', 'passed', 'passed'])
    expect(lane(p, 'A').done).toBe(true)
    expect(lane(p, 'A').restore).toEqual({ status: 'restored', target: 1000 })
  })

  it('shows the case waiting its turn as running, and says what it is waiting for', () => {
    const p = applyEvent(initialProgress(run), {
      type: 'waiting',
      lane: 'A',
      failure: 'member-busy',
      seconds: 5,
    })
    expect(lane(p, 'A').waiting).toEqual({ failure: 'member-busy', seconds: 5 })
    expect(statuses(p, 'A')[0]).toBe('running')
  })

  it('clears the waiting note when the lane is done', () => {
    let p = applyEvent(initialProgress(run), {
      type: 'waiting',
      lane: 'A',
      failure: 'member-busy',
      seconds: 5,
    })
    p = applyEvent(p, { type: 'lane-done', lane: 'A', restore: null })
    expect(lane(p, 'A').waiting).toBeNull()
  })

  it('shows no case running in a lane the server says is done, whatever results it has', () => {
    const p = initialProgress({
      ...run,
      lanes: [{ lane: 'A', cases: ['a/1', 'a/2'], position: 2, done: true, restore: null }],
    })
    expect(statuses(p, 'A')).toEqual(['waiting', 'waiting'])
  })

  it('clears the waiting note when the next case arrives', () => {
    let p = applyEvent(initialProgress(run), {
      type: 'waiting',
      lane: 'A',
      failure: 'lane-busy',
      seconds: 2,
    })
    p = applyEvent(p, { type: 'case', lane: 'A', caseId: 'a/1', status: 'passed', durationMs: 1 })
    expect(lane(p, 'A').waiting).toBeNull()
  })

  it('shows the cases a stopped lane never reached as not run, not as waiting', () => {
    let p = applyEvent(initialProgress(run), {
      type: 'case',
      lane: 'A',
      caseId: 'a/1',
      status: 'passed',
      durationMs: 1,
    })
    p = applyEvent(p, { type: 'lane-failed', lane: 'A', failure: 'no-session' })
    expect(statuses(p, 'A')).toEqual(['passed', 'not-run', 'not-run'])
    expect(lane(p, 'A').failure).toBe('no-session')
  })

  it('picks up results the server already has, so a run can be resumed', () => {
    const resumed = initialProgress({
      ...run,
      lanes: [{ lane: 'A', cases: ['a/1', 'a/2'], position: 1, done: false, restore: null }],
      results: [
        {
          caseId: 'a/1',
          lane: 'A',
          status: 'passed',
          result: { caseId: 'a/1', status: 'passed', steps: [], durationMs: 9 },
        },
      ],
    })
    expect(statuses(resumed, 'A')).toEqual(['passed', 'running'])
  })
})

describe('counts', () => {
  it('counts each kind of result, and what has not finished', () => {
    let p = initialProgress(run)
    const result = (
      laneName: 'read' | 'A',
      caseId: string,
      status: 'passed' | 'failed' | 'timed_out' | 'error',
    ) => (p = applyEvent(p, { type: 'case', lane: laneName, caseId, status, durationMs: 1 }))
    result('read', 'r/1', 'passed')
    result('A', 'a/1', 'failed')
    result('A', 'a/2', 'timed_out')
    result('A', 'a/3', 'error')
    expect(counts(p)).toEqual({
      total: 5,
      finished: 4,
      passed: 1,
      failed: 1,
      timedOut: 1,
      error: 1,
    })
  })
})

describe('isOver', () => {
  it('is false while any lane is still going, true when each is done or has stopped', () => {
    let p = initialProgress(run)
    expect(isOver(p)).toBe(false)
    p = applyEvent(p, { type: 'lane-done', lane: 'read', restore: null })
    expect(isOver(p)).toBe(false)
    p = applyEvent(p, { type: 'lane-failed', lane: 'A', failure: 'unexpected' })
    expect(isOver(p)).toBe(true)
  })
})

describe('pointsGivenBack', () => {
  const finish = (a: 'restored' | 'not-restored' | 'nothing-owed' | null, stopped = false) => {
    let p = initialProgress(run)
    p = applyEvent(p, { type: 'lane-done', lane: 'read', restore: null })
    if (stopped) return applyEvent(p, { type: 'lane-failed', lane: 'A', failure: 'unexpected' })
    return applyEvent(p, {
      type: 'lane-done',
      lane: 'A',
      restore:
        a === null ? null : a === 'nothing-owed' ? { status: a } : { status: a, target: 1000 },
    })
  }

  it('says all when a member lane restored what it moved', () => {
    expect(pointsGivenBack(finish('restored'))).toBe('all')
  })

  it('says none moved, not given back, when the member lanes owed nothing', () => {
    expect(pointsGivenBack(finish('nothing-owed'))).toBe('none-moved')
  })

  it('says not all when a restore did not reach its target', () => {
    expect(pointsGivenBack(finish('not-restored'))).toBe('not-all')
  })

  it('says unknown, never all, when a member lane stopped or did not report', () => {
    expect(pointsGivenBack(finish(null, true))).toBe('unknown')
    expect(pointsGivenBack(finish(null))).toBe('unknown')
  })

  it('says none moved when the run had no member lane', () => {
    const p = initialProgress({ ...run, lanes: [run.lanes[0]!] })
    expect(pointsGivenBack(p)).toBe('none-moved')
  })
})
