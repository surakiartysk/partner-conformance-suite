import { describe, expect, it } from 'vitest'
import type { Failure } from '../src/api'
import { messageFor } from '../src/messages'

const ALL: Failure[] = [
  'no-session',
  'rate-limited',
  'run-limit',
  'member-busy',
  'lane-busy',
  'not-found',
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

  it('says what to do next when the server answers with something unreadable, not only that it did', () => {
    expect(messageFor('unexpected')).toBe(
      'Something went wrong on the server. Try again, or start a new session.',
    )
    expect(messageFor('unexpected')).not.toContain('does not understand')
  })

  it('rounds a wait up to whole minutes, so it never says too soon', () => {
    expect(messageFor('rate-limited', 3600)).toContain('60 min')
    expect(messageFor('rate-limited', 61)).toContain('2 min')
    expect(messageFor('rate-limited', 1)).toContain('1 min')
  })

  it('says a run limit in whole minutes too, and names no wait it was not given', () => {
    expect(messageFor('run-limit', 600)).toContain('10 min')
    expect(messageFor('run-limit')).not.toMatch(/\d|NaN|undefined/)
  })

  it('does not name a wait it was not given', () => {
    expect(messageFor('rate-limited')).not.toMatch(/\d|NaN|undefined/)
  })
})
