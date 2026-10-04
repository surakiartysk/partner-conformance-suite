import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { CASES } from '../src/index'
import type { CaseContext, RequestSpec, Step } from '../src/define'
import { Quantity } from '../src/matchers'
import { planLanes } from '../src/lanes'

/**
 * The catalogue of cases as a whole: well-formed, and only ever asking a
 * partner for something the spec says it has.
 */

const spec = parse(readFileSync(new URL('../../spec/openapi.yaml', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>
}

const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.keys(item)
    .filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
    .map((method) => ({
      method: method.toUpperCase(),
      pattern: new RegExp('^' + path.replace(/\{[^}]+\}/g, '[^/]+') + '$'),
    })),
)

const ctx: CaseContext = {
  member: { id: 'mbr_x' },
  start: new Quantity('balance at start', 1000),
  steps: {},
  ref: (label = '') => `ref_${label}`,
  unknownId: (prefix) => `${prefix}unknown`,
}

const stepsOf = (c: (typeof CASES)[number]): Step[] => [
  ...(c.arrange ?? []),
  c.act,
  ...(c.verify ?? []),
]

describe('the case catalogue', () => {
  it('has unique ids, each prefixed by its service', () => {
    const ids = CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CASES) expect(c.id.split('/')[0]).toBe(c.service)
  })

  it('gives every act and verify step an expectation', () => {
    const missing = CASES.flatMap((c) =>
      [c.act, ...(c.verify ?? [])].filter((s) => !s.expect).map((s) => `${c.id}:${s.name}`),
    )
    expect(missing).toEqual([])
  })

  it('asks only for operations the spec lists', () => {
    const unknown = CASES.flatMap((c) =>
      stepsOf(c)
        .map((s) => s.request(ctx))
        .filter((r): r is RequestSpec => !('replayOf' in r))
        .filter((r) => !operations.some((o) => o.method === r.method && o.pattern.test(r.path)))
        .map((r) => `${c.id}: ${r.method} ${r.path}`),
    )
    expect(unknown).toEqual([])
  })

  it('names, in every replay, a step that comes before it', () => {
    for (const c of CASES) {
      const seen: string[] = []
      for (const step of stepsOf(c)) {
        const request = step.request(ctx)
        if ('replayOf' in request) expect(seen).toContain(request.replayOf)
        seen.push(step.name)
      }
    }
  })
})

describe('planLanes', () => {
  it('queues writing cases per member in order, and leaves the rest free', () => {
    const lanes = planLanes(CASES)
    expect(lanes.readOnly.every((c) => !c.writes)).toBe(true)
    expect(lanes.members.A.every((c) => c.writes && c.member === 'A')).toBe(true)
    expect(lanes.members.B.every((c) => c.writes && c.member === 'B')).toBe(true)
    expect(lanes.readOnly.length + lanes.members.A.length + lanes.members.B.length).toBe(
      CASES.length,
    )
    const order = (list: typeof CASES) => list.map((c) => CASES.indexOf(c))
    for (const lane of [lanes.members.A, lanes.members.B]) {
      expect(order(lane)).toEqual([...order(lane)].sort((a, b) => a - b))
    }
  })

  it('gives both members work, so a run shows two lanes side by side', () => {
    const { members } = planLanes(CASES)
    expect(members.A.length).toBeGreaterThan(0)
    expect(members.B.length).toBeGreaterThan(0)
  })
})
