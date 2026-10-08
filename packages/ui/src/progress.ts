import type { CaseStatus, Failure, Lane, Restore, RunView } from './api'
import type { DriveEvent } from './driver'

/**
 * What the lanes look like at this moment, built from the run as the server
 * planned it and the events the driver reports. Plain data in, plain data out,
 * so the rules (which row is running, what a stopped lane shows) are tested
 * without a page.
 */

export interface Finished {
  status: CaseStatus
  durationMs: number
}

export interface LaneProgress {
  lane: Lane
  cases: string[]
  finished: Record<string, Finished>
  done: boolean
  restore: Restore | null
  /** Set while the lane waits for a member, or for another tab. */
  waiting: { failure: 'member-busy' | 'lane-busy'; seconds: number } | null
  /** Set when the lane stopped before it was done. */
  failure: Failure | null
}

export interface Progress {
  lanes: LaneProgress[]
}

export type RowStatus = CaseStatus | 'running' | 'waiting' | 'not-run'

export interface Row {
  caseId: string
  status: RowStatus
  durationMs?: number
}

export function initialProgress(run: RunView): Progress {
  return {
    lanes: run.lanes.map((lane) => ({
      lane: lane.lane,
      cases: lane.cases,
      finished: Object.fromEntries(
        run.results
          .filter((r) => r.lane === lane.lane)
          .map((r) => [r.caseId, { status: r.status, durationMs: r.result.durationMs }]),
      ),
      done: lane.done,
      restore: lane.restore,
      waiting: null,
      failure: null,
    })),
  }
}

export function applyEvent(progress: Progress, event: DriveEvent): Progress {
  return {
    lanes: progress.lanes.map((lane) => {
      if (lane.lane !== event.lane) return lane
      switch (event.type) {
        case 'case':
          return {
            ...lane,
            waiting: null,
            finished: {
              ...lane.finished,
              [event.caseId]: { status: event.status, durationMs: event.durationMs },
            },
          }
        case 'waiting':
          return { ...lane, waiting: { failure: event.failure, seconds: event.seconds } }
        case 'lane-done':
          return { ...lane, done: true, waiting: null, restore: event.restore }
        case 'lane-failed':
          return { ...lane, waiting: null, failure: event.failure }
      }
    }),
  }
}

/**
 * A lane's rows in order. The first case without a result is the one running
 * (or waiting its turn, if the lane is held up); those after it are waiting.
 * A lane that stopped shows the cases it never reached as not run, not as
 * waiting for something that will not come.
 */
export function rows(lane: LaneProgress): Row[] {
  let running = false
  return lane.cases.map((caseId) => {
    const finished = lane.finished[caseId]
    if (finished) return { caseId, status: finished.status, durationMs: finished.durationMs }
    if (lane.failure) return { caseId, status: 'not-run' }
    if (!running && !lane.done) {
      running = true
      return { caseId, status: 'running' }
    }
    return { caseId, status: 'waiting' }
  })
}

export interface Counts {
  total: number
  finished: number
  passed: number
  failed: number
  timedOut: number
  error: number
}

export function counts(progress: Progress): Counts {
  const result: Counts = { total: 0, finished: 0, passed: 0, failed: 0, timedOut: 0, error: 0 }
  for (const lane of progress.lanes) {
    result.total += lane.cases.length
    for (const caseId of lane.cases) {
      const finished = lane.finished[caseId]
      if (!finished) continue
      result.finished++
      if (finished.status === 'passed') result.passed++
      else if (finished.status === 'failed') result.failed++
      else if (finished.status === 'timed_out') result.timedOut++
      else result.error++
    }
  }
  return result
}

/** Every lane is done or has stopped: nothing more will happen. */
export const isOver = (progress: Progress) => progress.lanes.every((l) => l.done || l.failure)

/**
 * Whether each member's points were given back, as far as the lanes know.
 * `unknown` when a member lane stopped before it could say; the sweep gives
 * those back later, and the page must not claim they were.
 */
export function pointsGivenBack(progress: Progress): 'all' | 'not-all' | 'unknown' | 'none-moved' {
  const members = progress.lanes.filter((l) => l.lane !== 'read')
  if (members.length === 0) return 'none-moved'
  if (members.some((l) => l.restore?.status === 'not-restored')) return 'not-all'
  if (members.some((l) => !l.done || l.restore === null)) return 'unknown'
  // A lane that owed nothing moved nothing: "given back" would claim a thing that did not happen.
  if (members.every((l) => l.restore?.status === 'nothing-owed')) return 'none-moved'
  return 'all'
}

/** The one-line verdict of a run: what the summary shows and what is announced when it ends. */
export function verdictText(c: Counts): string {
  const notPassed = c.total - c.passed
  return notPassed === 0
    ? `All ${c.total} cases passed`
    : `${notPassed} of ${c.total} ${c.total === 1 ? 'case' : 'cases'} did not pass`
}
