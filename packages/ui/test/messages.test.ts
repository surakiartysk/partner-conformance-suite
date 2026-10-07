import { describe, expect, it } from 'vitest'
import type { Failure } from '../src/api'
import { messageFor } from '../src/messages'

const ALL: Failure[] = [
  'no-session',
  'rate-limited',
  'not-configured',
  'already-shown',
  'unavailable',
  'network',
  'unexpected',
]

describe('messageFor', () => {
  it('has a message of its own for every kind of failure, and no two alike', () => {
    const messages = ALL.map((failure) => messageFor(failure))
    expect(messages.every((m) => m.length > 20)).toBe(true)
    expect(new Set(messages).size).toBe(ALL.length)
  })

  it('rounds a wait up to whole minutes, so it never says too soon', () => {
    expect(messageFor('rate-limited', 3600)).toContain('60 min')
    expect(messageFor('rate-limited', 61)).toContain('2 min')
    expect(messageFor('rate-limited', 1)).toContain('1 min')
  })

  it('does not name a wait it was not given', () => {
    expect(messageFor('rate-limited')).not.toMatch(/\d|NaN|undefined/)
  })
})
