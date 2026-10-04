/**
 * What a case expects, as values rather than assertions.
 *
 * An expectation is a plain object whose leaves are either literal values or
 * matchers. The runner compares a response against it, and the dashboard shows
 * the same object in the "expected" column — so what is displayed and what is
 * checked cannot drift apart, because they are one thing.
 *
 * The vocabulary is kept small on purpose. Every matcher is something a
 * partner's engineer has to read and agree with.
 */

export interface Matcher {
  readonly kind: 'matcher'
  /** How the expected value reads on the result page. */
  readonly description: string
  test(actual: unknown): boolean
}

function matcher(description: string, test: (actual: unknown) => boolean): Matcher {
  return { kind: 'matcher', description, test }
}

export function isMatcher(value: unknown): value is Matcher {
  return (
    typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'matcher'
  )
}

export const any = {
  string: () =>
    matcher('any non-empty string', (actual) => typeof actual === 'string' && actual.length > 0),
  integer: () => matcher('any integer', (actual) => Number.isInteger(actual)),
}

/**
 * A header's media type, ignoring parameters: `application/problem+json;
 * charset=utf-8` is still `application/problem+json`.
 */
export function mediaType(type: string): Matcher {
  return matcher(`media type ${type}`, (actual) =>
    typeof actual === 'string' ? actual.split(';')[0]!.trim().toLowerCase() === type : false,
  )
}

export function oneOf(...values: readonly (string | number)[]): Matcher {
  return matcher(`one of ${values.map((v) => JSON.stringify(v)).join(', ')}`, (actual) =>
    values.includes(actual as string | number),
  )
}

const format = (n: number) => n.toLocaleString('en-US')

/**
 * A number read during the run — a balance at the start of a case — that an
 * expectation does arithmetic on.
 *
 * The arithmetic and its description come from the same call, so "balance at
 * start + 100 = 1,100" on the result page is the very sum the check used. A
 * case that wrote the formula as a string beside the number could say one
 * thing and test another.
 */
export class Quantity {
  constructor(
    readonly label: string,
    readonly value: number,
  ) {}

  plus(amount: number): Matcher {
    const expected = this.value + amount
    return matcher(`${this.label} + ${format(amount)} = ${format(expected)}`, (a) => a === expected)
  }

  minus(amount: number): Matcher {
    const expected = this.value - amount
    return matcher(`${this.label} − ${format(amount)} = ${format(expected)}`, (a) => a === expected)
  }

  unchanged(): Matcher {
    return matcher(`${this.label}, unchanged = ${format(this.value)}`, (a) => a === this.value)
  }
}
