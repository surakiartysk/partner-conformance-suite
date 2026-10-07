import { describe, expect, it } from 'vitest'
import { points, timeLeft } from '../src/format'

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
