import { describe, expect, it } from 'vitest'
import { ago, points, runSummary, timeLeft } from '../src/format'

describe('points', () => {
  it('groups thousands', () => {
    expect(points(1000)).toBe('1,000')
    expect(points(1100)).toBe('1,100')
    expect(points(0)).toBe('0')
  })
})

describe('timeLeft', () => {
  const at = Date.parse('2026-10-07T12:00:00Z')
  const later = (ms: number) => new Date(at + ms).toISOString()

  it('says hours and minutes, rounded down', () => {
    expect(timeLeft(later(24 * 3_600_000), at)).toBe('24 h 0 min')
    expect(timeLeft(later(23 * 3_600_000 + 41 * 60_000 + 59_000), at)).toBe('23 h 41 min')
  })

  it('says minutes alone under an hour', () => {
    expect(timeLeft(later(12 * 60_000), at)).toBe('12 min')
  })

  it('says ended at the end, past it, and when it cannot be read', () => {
    expect(timeLeft(later(0), at)).toBe('ended')
    expect(timeLeft(later(30_000), at)).toBe('ended') // under a minute is not "0 min"
    expect(timeLeft(later(-5 * 60_000), at)).toBe('ended')
    expect(timeLeft('not a date', at)).toBe('ended')
  })
})

describe('ago', () => {
  const at = Date.parse('2026-10-08T12:00:00Z')
  const before = (ms: number) => new Date(at - ms).toISOString()

  it('says just now for under a minute', () => {
    expect(ago(before(0), at)).toBe('just now')
    expect(ago(before(59_000), at)).toBe('just now')
  })

  it('says minutes, hours and days in the largest unit that fits, rounded down', () => {
    expect(ago(before(60_000), at)).toBe('1 min ago')
    expect(ago(before(59 * 60_000 + 59_000), at)).toBe('59 min ago')
    expect(ago(before(60 * 60_000), at)).toBe('1 h ago')
    expect(ago(before(23 * 3_600_000 + 59 * 60_000), at)).toBe('23 h ago')
    expect(ago(before(24 * 3_600_000), at)).toBe('1 d ago')
    expect(ago(before(50 * 3_600_000), at)).toBe('2 d ago')
  })

  it('says just now for a time ahead of the clock, and for one it cannot read', () => {
    expect(ago(before(-5 * 60_000), at)).toBe('just now')
    expect(ago('not a date', at)).toBe('just now')
  })
})

describe('runSummary', () => {
  const counts = (passed: number, failed = 0, timedOut = 0, error = 0) => ({
    passed,
    failed,
    timedOut,
    error,
  })
  const done = '2026-10-09T10:00:00.000Z'

  it('says every case passed when none did not, and how many', () => {
    expect(runSummary({ finishedAt: done, total: 20, counts: counts(20) })).toBe('all 20 passed')
    expect(runSummary({ finishedAt: done, total: 1, counts: counts(1) })).toBe('passed')
  })

  it('counts a failure, a timeout and an error together as the ones that did not pass', () => {
    expect(runSummary({ finishedAt: done, total: 20, counts: counts(17, 1, 1, 1) })).toBe(
      '17 passed, 3 did not',
    )
  })

  it('says a run that has not ended has not ended, however its counts look', () => {
    expect(runSummary({ finishedAt: null, total: 20, counts: counts(20) })).toBe('not finished')
  })
})
