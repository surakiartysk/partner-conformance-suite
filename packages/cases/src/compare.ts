import { isMatcher } from './matchers'

/**
 * Comparing a response with an expectation.
 *
 * The rules, which the spec's own evolution depends on:
 *
 * - A field the expectation names must be present and match.
 * - A field the response has and the expectation does not name is fine. A spec
 *   may add fields; a partner that adds one early breaks nobody.
 * - Arrays must match element for element.
 */

export interface Mismatch {
  /** Where, as a JSON path: `$.balance`, `$.items[2].id`. */
  path: string
  /** What was expected, as it reads on the result page. */
  expected: string
  /** What arrived. Absent when `missing` is true. */
  actual?: unknown
  missing?: true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The expectation as it reads on the result page: matchers become their description. */
export function describeExpected(expected: unknown): unknown {
  if (isMatcher(expected)) return `‹${expected.description}›`
  if (Array.isArray(expected)) return expected.map(describeExpected)
  if (isPlainObject(expected)) {
    return Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, describeExpected(v)]))
  }
  return expected
}

function describe(expected: unknown): string {
  return isMatcher(expected) ? expected.description : JSON.stringify(expected)
}

export function compare(expected: unknown, actual: unknown, path = '$'): Mismatch[] {
  if (isMatcher(expected)) {
    return expected.test(actual) ? [] : [{ path, expected: expected.description, actual }]
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [{ path, expected: describe(describeExpected(expected)), actual }]
    }
    return expected.flatMap((item, i) => compare(item, actual[i], `${path}[${i}]`))
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      return [{ path, expected: 'an object', actual }]
    }
    return Object.entries(expected).flatMap(([key, value]) =>
      key in actual
        ? compare(value, actual[key], `${path}.${key}`)
        : [{ path: `${path}.${key}`, expected: describe(value), missing: true as const }],
    )
  }

  return Object.is(expected, actual) ? [] : [{ path, expected: describe(expected), actual }]
}
