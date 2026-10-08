import type { CaseResult, CaseStatus, Lane, Mismatch, Phase, RunView, StepRecord } from './api'

/**
 * Reading a case's result: which steps were judged, what did not match and how
 * to say so, and how a JSON value is laid out line by line so the lines that
 * differ can be marked. Everything here is plain data in and out; every string
 * that came from a partner stays a string and is shown as text.
 */

export const PHASE_LABEL: Record<Phase, string> = {
  start: 'Start',
  arrange: 'Arrange',
  act: 'Act',
  verify: 'Verify',
}

/** The steps that set the case up are only held to answering; the act and the verify are judged. */
export const isSetup = (step: StepRecord) => step.phase === 'start' || step.phase === 'arrange'

export function splitSteps(result: CaseResult) {
  return {
    setup: result.steps.filter(isSetup),
    judged: result.steps.filter((s) => !isSetup(s)),
  }
}

/** A value as it reads in a sentence: text in quotes, numbers grouped. */
export function show(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('en-US')
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === undefined) return 'nothing'
  return JSON.stringify(value)
}

const field = (path: string) => (path.startsWith('$.') ? path.slice(2) : path)

/** One sentence for one disagreement. */
export function describeMismatch(m: Mismatch): string {
  if (m.path === 'status') {
    return `The status should be ${m.expected}; the partner answered ${show(m.actual)}.`
  }
  if (m.path.startsWith('header ')) {
    const name = m.path.slice('header '.length)
    return m.missing
      ? `The answer should have a ${name} header (${m.expected}); it has none.`
      : `The ${name} header should be ${m.expected}; the partner sent ${show(m.actual)}.`
  }
  if (m.path === '$') {
    return `The body should be ${m.expected}; the partner answered ${show(m.actual)}.`
  }
  const name = field(m.path)
  return m.missing
    ? `${name} should be ${m.expected}; the answer has no ${name}.`
    : `${name} should be ${m.expected}; the partner answered ${show(m.actual)}.`
}

/** A step as it is named in a sentence: `Act · repeat`. */
export const stepLabel = (step: StepRecord) => `${PHASE_LABEL[step.phase]} · ${step.name}`

/**
 * What went wrong in a case, in the order the steps ran, each sentence naming
 * the step it is about: the act and the verify can disagree about the same field
 * in the same words, and two sentences alike would read as a mistake. Empty for a
 * case that passed.
 */
export function whatDidNotMatch(result: CaseResult): string[] {
  return result.steps.flatMap((step) => {
    if (step.outcome === 'timed_out' || step.outcome === 'error') {
      const why = step.error ?? (step.outcome === 'timed_out' ? 'no answer in time' : 'failed')
      return [`${stepLabel(step)}: ${why}`]
    }
    return step.mismatches.map((m) => `${stepLabel(step)}: ${describeMismatch(m)}`)
  })
}

/** How long a run took, for a sentence: a run under a second is said to be. */
export const formatSeconds = (seconds: number) => (seconds < 1 ? 'under a second' : `${seconds} s`)

/** The paths that disagreed, for marking lines. */
export const mismatchPaths = (step: StepRecord) => new Set(step.mismatches.map((m) => m.path))

export interface JsonLine {
  /** Everything before the value: indentation and `"key": `. */
  head: string
  /** The value, or the bracket that opens or closes. */
  value: string
  /** A comma, or nothing. */
  tail: string
  /** True for a matcher's description, which is not data. */
  matcher: boolean
  path: string
  marked: boolean
}

const MATCHER = /^‹(.*)›$/s

/**
 * A JSON value, one line per entry, each knowing its path so the lines a
 * mismatch names can be marked. Matchers (`‹…›` in what a case expects) come out
 * as their description with no quotes.
 */
export function jsonLines(value: unknown, marked: Set<string>, base = '$'): JsonLine[] {
  const lines: JsonLine[] = []
  const line = (
    depth: number,
    key: string | null,
    shown: string,
    path: string,
    last: boolean,
    matcher = false,
  ) =>
    lines.push({
      head: '  '.repeat(depth) + (key === null ? '' : `${JSON.stringify(key)}: `),
      value: shown,
      tail: last ? '' : ',',
      matcher,
      path,
      marked: marked.has(path),
    })

  function walk(v: unknown, depth: number, key: string | null, path: string, last: boolean) {
    if (Array.isArray(v)) {
      if (v.length === 0) return line(depth, key, '[]', path, last)
      line(depth, key, '[', path, true)
      v.forEach((item, i) => walk(item, depth + 1, null, `${path}[${i}]`, i === v.length - 1))
      line(depth, null, ']', path, last)
      lines[lines.length - 1]!.marked = false
      return
    }
    if (typeof v === 'object' && v !== null) {
      const entries = Object.entries(v)
      if (entries.length === 0) return line(depth, key, '{}', path, last)
      line(depth, key, '{', path, true)
      entries.forEach(([k, item], i) =>
        walk(item, depth + 1, k, `${path}.${k}`, i === entries.length - 1),
      )
      line(depth, null, '}', path, last)
      lines[lines.length - 1]!.marked = false
      return
    }
    if (typeof v === 'string') {
      const m = MATCHER.exec(v)
      if (m) return line(depth, key, m[1]!, path, last, true)
    }
    line(depth, key, JSON.stringify(v) ?? 'undefined', path, last)
  }

  walk(value, 0, null, base, true)
  return lines
}

/** A request body, laid out if it is JSON and left as it was sent if it is not. */
export function bodyLines(body: string): JsonLine[] | string | null {
  if (body === '') return null
  try {
    return jsonLines(JSON.parse(body) as unknown, new Set())
  } catch {
    return body
  }
}

export type Group = { title: string; items: { caseId: string; lane: Lane; status: CaseStatus }[] }

const LANE_TITLE: Record<Lane, string> = { read: 'Read-only', A: 'Member A', B: 'Member B' }

/**
 * The cases of a run for the list beside the detail: what did not pass first,
 * then each lane with its passes. A run's own order within a lane is kept.
 */
export function groupCases(run: RunView): Group[] {
  const notPassed = run.lanes.flatMap((lane) =>
    run.results.filter((r) => r.lane === lane.lane && r.status !== 'passed'),
  )
  const groups: Group[] = []
  if (notPassed.length > 0) {
    groups.push({
      title: `Did not pass · ${notPassed.length}`,
      items: notPassed.map((r) => ({ caseId: r.caseId, lane: r.lane, status: r.status })),
    })
  }
  for (const lane of run.lanes) {
    const passed = run.results.filter((r) => r.lane === lane.lane && r.status === 'passed')
    if (passed.length === 0) continue
    groups.push({
      title: `${LANE_TITLE[lane.lane]} · ${passed.length} passed`,
      items: passed.map((r) => ({ caseId: r.caseId, lane: r.lane, status: r.status })),
    })
  }
  return groups
}

/**
 * The case to show when none was asked for: the first that did not pass, else the
 * first that ran. "First" is the order the run planned them in, not the order
 * the server happened to return the results.
 */
export function defaultCase(run: RunView): string | undefined {
  const status = new Map(run.results.map((r) => [r.caseId, r.status]))
  const planned = run.lanes.flatMap((l) => l.cases)
  return (
    planned.find((id) => status.has(id) && status.get(id) !== 'passed') ??
    planned.find((id) => status.has(id)) ??
    planned[0]
  )
}

/** How long a finished run took, to the second the server records, or null while it goes on. */
export function runSeconds(run: RunView): number | null {
  if (!run.finishedAt) return null
  const seconds = Math.round((Date.parse(run.finishedAt) - Date.parse(run.createdAt)) / 1000)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}
