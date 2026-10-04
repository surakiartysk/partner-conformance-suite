import { describe, expect, it } from 'vitest'
import { compare, describeExpected } from '../src/compare'
import { Quantity, any } from '../src/matchers'

describe('compare', () => {
  it('passes a response with fields the expectation does not name', () => {
    expect(compare({ id: 'a' }, { id: 'a', added: 'later' })).toEqual([])
  })

  it('fails a field the expectation names and the response lacks, as missing', () => {
    expect(compare({ id: 'a', tier: 'gold' }, { id: 'a' })).toEqual([
      { path: '$.tier', expected: '"gold"', missing: true },
    ])
  })

  it('names the path of a nested mismatch', () => {
    expect(compare({ a: { b: [1, { c: 2 }] } }, { a: { b: [1, { c: 3 }] } })).toEqual([
      { path: '$.a.b[1].c', expected: '2', actual: 3 },
    ])
  })

  it('requires arrays to match in length', () => {
    expect(compare([1, 2], [1, 2, 3])).toEqual([
      { path: '$', expected: '[1,2]', actual: [1, 2, 3] },
    ])
  })

  it('fails an object expected where something else arrived', () => {
    expect(compare({ id: 'a' }, 'text')).toEqual([
      { path: '$', expected: 'an object', actual: 'text' },
    ])
    expect(compare({ id: 'a' }, [])).toEqual([{ path: '$', expected: 'an object', actual: [] }])
  })

  it('does not treat a number and its string as equal', () => {
    expect(compare({ n: 1 }, { n: '1' })).toHaveLength(1)
  })

  it('uses a matcher where one is given, and reports its description', () => {
    const start = new Quantity('balance at start', 1000)
    expect(compare({ balance: start.plus(100) }, { balance: 1100 })).toEqual([])
    expect(compare({ balance: start.plus(100) }, { balance: 1200 })).toEqual([
      { path: '$.balance', expected: 'balance at start + 100 = 1,100', actual: 1200 },
    ])
  })
})

describe('describeExpected', () => {
  it('shows matchers by description, and literals as they are', () => {
    expect(describeExpected({ id: any.string(), n: [1, any.integer()], s: 'x' })).toEqual({
      id: '‹any non-empty string›',
      n: [1, '‹any integer›'],
      s: 'x',
    })
  })
})
