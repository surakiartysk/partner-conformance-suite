import { describe, expect, it } from 'vitest'
import { Quantity, any, mediaType, oneOf } from '../src/matchers'

describe('matchers', () => {
  it('any.string wants a non-empty string', () => {
    expect([any.string().test('x'), any.string().test(''), any.string().test(1)]).toEqual([
      true,
      false,
      false,
    ])
  })

  it('any.integer wants an integer, not a numeric string or a fraction', () => {
    expect([any.integer().test(3), any.integer().test(1.5), any.integer().test('3')]).toEqual([
      true,
      false,
      false,
    ])
  })

  it('oneOf matches only its values', () => {
    expect([oneOf('a', 'b').test('b'), oneOf('a', 'b').test('c')]).toEqual([true, false])
  })

  it('mediaType ignores parameters and case, and nothing else', () => {
    const problem = mediaType('application/problem+json')
    expect(problem.test('application/problem+json')).toBe(true)
    expect(problem.test('Application/Problem+JSON; charset=utf-8')).toBe(true)
    expect(problem.test('application/json')).toBe(false)
    expect(problem.test(undefined)).toBe(false)
  })

  it('Quantity describes the very sum it checks', () => {
    const start = new Quantity('balance at start', 1000)
    expect(start.plus(100)).toMatchObject({ description: 'balance at start + 100 = 1,100' })
    expect(start.plus(100).test(1100)).toBe(true)
    expect(start.minus(1001)).toMatchObject({ description: 'balance at start − 1,001 = -1' })
    expect(start.minus(1001).test(-1)).toBe(true)
    expect(start.unchanged().test(1000)).toBe(true)
    expect(start.unchanged().test(999)).toBe(false)
  })
})
