import { describe, expect, it } from 'vitest'
import type { Mismatch, RunView } from '../src/api'
import {
  alignBodies,
  bodyLines,
  defaultCase,
  describeMismatch,
  formatSeconds,
  groupCases,
  jsonLines,
  mismatchPaths,
  runSeconds,
  shortProblemTypes,
  show,
  splitSteps,
  whatDidNotMatch,
} from '../src/result-model'
import { CORRECT, DOUBLE_EARN, PLAIN_ERRORS, SLOW_BALANCE } from './fixtures-runs'

const result = (run: RunView, id: string) => run.results.find((r) => r.caseId === id)!.result

describe('problem types in a sentence', () => {
  const base = 'https://points-partner.example/problems/'

  it('are their last part, so a list of them is not a wall of addresses', () => {
    expect(
      describeMismatch({
        path: '$.type',
        expected: `one of "${base}missing-signature", "${base}invalid-signature", "${base}stale-timestamp"`,
        actual: 'earn',
      }),
    ).toBe(
      'type should be one of "missing-signature", "invalid-signature", "stale-timestamp"; the partner answered "earn".',
    )
  })

  it('shorten whatever host the address has, and only a problem type', () => {
    expect(shortProblemTypes('"https://other.test/problems/x-y"')).toBe('"x-y"')
    expect(shortProblemTypes('"https://other.test/docs/x"')).toBe('"https://other.test/docs/x"')
    expect(shortProblemTypes('https://points-partner.example/problems/x')).toBe(
      'https://points-partner.example/problems/x',
    )
    expect(shortProblemTypes('plain words')).toBe('plain words')
  })

  it('stay whole in the lines of the body, which are data and not a sentence', () => {
    const lines = jsonLines({ type: `${base}missing-signature` }, new Set())
    expect(lines.map((l) => l.head + l.value + l.tail).join('')).toContain(
      `${base}missing-signature`,
    )
  })
})

describe('describing a mismatch', () => {
  const m = (over: Partial<Mismatch>): Mismatch => ({ path: '$.balance', expected: 'x', ...over })

  it('says what was expected and what the partner answered, for a field', () => {
    expect(describeMismatch(m({ expected: 'balance at start + 100 = 1,200', actual: 1300 }))).toBe(
      'balance should be balance at start + 100 = 1,200; the partner answered 1,300.',
    )
  })

  it('shows text in quotes and numbers grouped, so a string and a number cannot be confused', () => {
    expect(
      describeMismatch(m({ path: '$.id', expected: 'any non-empty string', actual: '1300' })),
    ).toContain('answered "1300"')
    expect(describeMismatch(m({ actual: 1300 }))).toContain('answered 1,300')
  })

  it('says a field the answer lacks is missing, not that it was wrong', () => {
    expect(describeMismatch(m({ path: '$.tier', expected: '"gold"', missing: true }))).toBe(
      'tier should be "gold"; the answer has no tier.',
    )
  })

  it('says the status, and the body, in their own words', () => {
    expect(describeMismatch(m({ path: 'status', expected: '200', actual: 503 }))).toBe(
      'The status should be 200; the partner answered 503.',
    )
    expect(
      describeMismatch(m({ path: '$', expected: 'an object', actual: 'Member not found' })),
    ).toBe('The body should be an object; the partner answered "Member not found".')
  })

  it('says a header apart from a field', () => {
    expect(
      describeMismatch(
        m({
          path: 'header content-type',
          expected: 'media type application/problem+json',
          actual: 'text/plain',
        }),
      ),
    ).toBe(
      'The content-type header should be media type application/problem+json; the partner sent "text/plain".',
    )
    expect(
      describeMismatch(m({ path: 'header content-type', expected: 'media type x', missing: true })),
    ).toContain('has none')
  })

  it('names a value that is not there as nothing, never as undefined', () => {
    expect(show(undefined)).toBe('nothing')
    expect(describeMismatch(m({ actual: undefined }))).not.toContain('undefined')
  })
})

describe('what did not match, from a real run', () => {
  it('lists each field the repeat got wrong, in the order the steps ran', () => {
    const sentences = whatDidNotMatch(result(DOUBLE_EARN, 'earn/duplicate-reference'))
    expect(sentences).toHaveLength(3) // the repeat's two fields, then the balance read back
    expect(sentences[0]).toMatch(
      /^Act · repeat: transactionId should be "txn_\w+"; the partner answered "txn_\w+"\.$/,
    )
    expect(sentences[1]).toMatch(
      /^Act · repeat: balance should be balance at start \+ 100 = 1,\d{3}; the partner answered 1,\d{3}\.$/,
    )
  })

  it('says nothing for a case that passed', () => {
    expect(whatDidNotMatch(result(DOUBLE_EARN, 'earn/adds-points'))).toEqual([])
    expect(whatDidNotMatch(result(CORRECT, 'earn/duplicate-reference'))).toEqual([])
  })

  it('says a body that is not an object, and the header that gave it away', () => {
    const sentences = whatDidNotMatch(result(PLAIN_ERRORS, 'member/unknown'))
    expect(sentences).toContain(
      'Act · request: The content-type header should be media type application/problem+json; the partner sent "text/plain; charset=UTF-8".',
    )
    expect(sentences).toContain(
      'Act · request: The body should be an object; the partner answered "Member not found".',
    )
  })

  it('says a step that got no answer with what the server recorded, and which step it was', () => {
    expect(whatDidNotMatch(result(SLOW_BALANCE, 'member/balance'))).toEqual([
      'Act · request: no response within 10000 ms',
    ])
  })
})

describe('naming the step a sentence is about', () => {
  it('tells the act and the verify apart when they disagree in the same words', () => {
    const sentences = whatDidNotMatch(result(DOUBLE_EARN, 'earn/duplicate-reference'))
    expect(new Set(sentences).size).toBe(sentences.length) // no two alike
    expect(sentences.filter((s) => s.startsWith('Verify · balance: '))).toHaveLength(1)
  })
})

describe('how long a run took, said', () => {
  it('says seconds, and says so when it was under one', () => {
    expect(formatSeconds(31)).toBe('31 s')
    expect(formatSeconds(1)).toBe('1 s')
    expect(formatSeconds(0)).toBe('under a second')
  })
})

describe('splitting the steps', () => {
  it('puts the start and the arrange steps in the setup and the act and verify steps in what is judged', () => {
    const { setup, judged } = splitSteps(result(DOUBLE_EARN, 'earn/duplicate-reference'))
    expect(setup.map((s) => s.phase)).toEqual(['start', 'arrange'])
    expect(judged.map((s) => s.phase)).toEqual(['act', 'verify'])
  })
})

describe('mismatch paths', () => {
  it('are the paths the step disagreed on', () => {
    const act = result(DOUBLE_EARN, 'earn/duplicate-reference').steps.find(
      (s) => s.phase === 'act',
    )!
    expect([...mismatchPaths(act)].sort()).toEqual(['$.balance', '$.transactionId'])
  })
})

describe('laying out JSON', () => {
  const text = (v: unknown, marked: string[] = []) =>
    jsonLines(v, new Set(marked)).map((l) => l.head + l.value + l.tail)

  it('puts one entry on a line, indented, with commas between and none after the last', () => {
    expect(text({ a: 1, b: { c: 'x' }, d: [1, 2] })).toEqual([
      '{',
      '  "a": 1,',
      '  "b": {',
      '    "c": "x"',
      '  },',
      '  "d": [',
      '    1,',
      '    2',
      '  ]',
      '}',
    ])
  })

  it('writes empty objects and arrays on one line', () => {
    expect(text({ a: {}, b: [] })).toEqual(['{', '  "a": {},', '  "b": []', '}'])
  })

  it('marks exactly the lines whose path disagreed, nested paths included', () => {
    const lines = jsonLines({ a: 1, items: [{ id: 'x' }, { id: 'y' }] }, new Set(['$.items[1].id']))
    expect(lines.filter((l) => l.marked).map((l) => l.head + l.value)).toEqual(['      "id": "y"'])
  })

  it('does not mark the closing bracket of an object that was marked', () => {
    const lines = jsonLines({ a: { b: 1 } }, new Set(['$.a']))
    expect(lines.map((l) => l.marked)).toEqual([false, true, false, false, false])
  })

  it('shows a matcher as its description with no quotes, and says it is not data', () => {
    const [, line] = jsonLines({ balance: '‹balance at start + 100 = 1,200›' }, new Set())
    expect(line!.value).toBe('balance at start + 100 = 1,200')
    expect(line!.matcher).toBe(true)
  })

  it('does not take a string that merely contains a guillemet for a matcher', () => {
    const [, line] = jsonLines({ note: 'a ‹b› c' }, new Set())
    expect(line!.matcher).toBe(false)
    expect(line!.value).toBe('"a ‹b› c"')
  })

  it('writes null, true and false as they are', () => {
    expect(text({ a: null, b: true })).toEqual(['{', '  "a": null,', '  "b": true', '}'])
  })
})

describe('a request body', () => {
  it('is laid out when it is JSON', () => {
    const lines = bodyLines('{"memberId":"m1","points":100}')
    expect(Array.isArray(lines) && lines.map((l) => l.head + l.value + l.tail)).toEqual([
      '{',
      '  "memberId": "m1",',
      '  "points": 100',
      '}',
    ])
  })

  it('is left as it was sent when it is not, and is nothing when it is empty', () => {
    expect(bodyLines('not json {')).toBe('not json {')
    expect(bodyLines('')).toBeNull()
  })
})

describe('grouping the cases of a run', () => {
  it('puts what did not pass first, then each lane with what passed, in the order the server lists the lanes', () => {
    const groups = groupCases(DOUBLE_EARN)
    expect(groups.map((g) => g.title)).toEqual([
      'Did not pass · 1',
      'Member A · 2 passed',
      'Read-only · 1 passed',
    ])
    expect(groups[0]!.items.map((i) => i.caseId)).toEqual(['earn/duplicate-reference'])
    expect(groups[1]!.items.map((i) => i.caseId)).toEqual([
      'earn/adds-points',
      'earn/invalid-points',
    ])
    expect(groups[2]!.items.map((i) => i.caseId)).toEqual(['earn/unknown-member'])
  })

  it('has no group for nothing that did not pass, and one for each lane that has passes', () => {
    expect(groupCases(CORRECT).map((g) => g.title)).toEqual([
      'Member A · 3 passed',
      'Read-only · 1 passed',
    ])
  })

  it('leaves out a lane in which nothing passed', () => {
    const failed: RunView = {
      ...DOUBLE_EARN,
      results: DOUBLE_EARN.results.map((r) =>
        r.lane === 'read' ? { ...r, status: 'failed' as const } : r,
      ),
    }
    const titles = groupCases(failed).map((g) => g.title)
    expect(titles).toEqual(['Did not pass · 2', 'Member A · 2 passed'])
  })

  it('lists a timed out case with what did not pass', () => {
    expect(groupCases(SLOW_BALANCE)[0]!.items.map((i) => [i.caseId, i.status])).toEqual([
      ['member/balance', 'timed_out'],
    ])
  })
})

describe('the case to show first', () => {
  it('is the first that did not pass', () => {
    expect(defaultCase(DOUBLE_EARN)).toBe('earn/duplicate-reference')
  })

  it('is the first the run planned, not the first the server returned, when everything passed', () => {
    const reversed: RunView = { ...CORRECT, results: [...CORRECT.results].reverse() }
    expect(defaultCase(reversed)).toBe('earn/adds-points')
    expect(reversed.results[0]!.caseId).not.toBe('earn/adds-points')
  })

  it('is the first that did not pass in the planned order, whatever order the results came in', () => {
    const twoFailed: RunView = {
      ...DOUBLE_EARN,
      results: DOUBLE_EARN.results
        .map((r) => (r.caseId === 'earn/invalid-points' ? { ...r, status: 'failed' as const } : r))
        .reverse(),
    }
    expect(defaultCase(twoFailed)).toBe('earn/duplicate-reference')
  })

  it('is the first one planned when none has run yet, and nothing for an empty run', () => {
    const none: RunView = { ...DOUBLE_EARN, results: [] }
    expect(defaultCase(none)).toBe(DOUBLE_EARN.lanes[0]!.cases[0])
    expect(defaultCase({ ...none, lanes: [] })).toBeUndefined()
  })
})

describe('how long a run took', () => {
  const at = (finishedAt: string | null): RunView => ({
    ...DOUBLE_EARN,
    createdAt: '2026-10-08T03:57:07.000Z',
    finishedAt,
  })

  it('is the seconds between its start and its end', () => {
    expect(runSeconds(at('2026-10-08T03:57:38.000Z'))).toBe(31)
  })

  it('is nothing while the run goes on, and nothing for times that cannot be read or run backwards', () => {
    expect(runSeconds(at(null))).toBeNull()
    expect(runSeconds(at('not a date'))).toBeNull()
    expect(runSeconds(at('2026-10-08T03:57:00.000Z'))).toBeNull()
  })
})

describe('two bodies side by side', () => {
  const lines = (value: unknown, marked: string[] = []) => jsonLines(value, new Set(marked))
  const text = (ls: { head: string; value: string; tail: string }[]) =>
    ls.map((l) => l.head + l.value + l.tail)

  it('are the same length, line for line, whatever each had', () => {
    const both = alignBodies(
      lines({ a: 1, b: 2 }),
      lines({ a: 1, extra: true, b: 3, more: { x: 1 } }),
    )
    expect(both.expected).toHaveLength(both.actual.length)
  })

  it('say "not checked" where the case expected nothing of a field, and leave the line it did check', () => {
    const both = alignBodies(
      lines({ id: 'x', balance: 1200 }, ['$.id', '$.balance']),
      lines({ id: 'y', type: 'earn', balance: 1300 }, ['$.id', '$.balance']),
    )
    expect(text(both.expected)).toEqual([
      '{',
      '  "id": "x",',
      '  "type": not checked',
      '  "balance": 1200',
      '}',
    ])
    expect(text(both.actual)).toEqual([
      '{',
      '  "id": "y",',
      '  "type": "earn",',
      '  "balance": 1300',
      '}',
    ])
  })

  it('keeps a red mark where it was, and puts none on a line that was not checked', () => {
    const both = alignBodies(
      lines({ id: 'x', balance: 1 }, ['$.id']),
      lines({ id: 'y', type: 'earn', balance: 2 }, ['$.id']),
    )
    expect(both.expected.map((l) => l.marked)).toEqual([false, true, false, false, false])
    expect(both.actual.map((l) => l.marked)).toEqual([false, true, false, false, false])
  })

  it('say "missing" in the answer where the case expected a field it lacks, and keep the mark', () => {
    const both = alignBodies(lines({ id: 'x', tier: 'gold' }, ['$.tier']), lines({ id: 'x' }))
    expect(text(both.actual)).toEqual(['{', '  "id": "x"', '  "tier": missing', '}'])
    expect(both.actual.find((l) => l.value === 'missing')!.marked).toBe(true)
    expect(both.expected.find((l) => l.value.includes('gold'))!.marked).toBe(true)
  })

  it('give an object nothing expected of it one "not checked" and blank lines for what is inside it', () => {
    const both = alignBodies(lines({ id: 1 }), lines({ id: 1, nested: { a: 1, b: [2] } }))
    const shown = text(both.expected)
    expect(shown.filter((l) => l.includes('not checked'))).toEqual(['  "nested": not checked'])
    expect(shown.slice(2).every((l) => !/\d/.test(l))).toBe(true)
    expect(both.expected).toHaveLength(both.actual.length)
  })

  it('leave two bodies that agree exactly as they were', () => {
    const body = { a: 1, b: { c: [1, 2] } }
    const both = alignBodies(lines(body), lines(body))
    expect(text(both.expected)).toEqual(text(lines(body)))
    expect(text(both.actual)).toEqual(text(lines(body)))
  })

  it('show the placeholder as a description, not as data', () => {
    const both = alignBodies(lines({ a: 1 }), lines({ a: 1, b: 2 }))
    expect(both.expected.find((l) => l.value === 'not checked')!.matcher).toBe(true)
  })
})
