import { mediaType, oneOf } from './matchers'

/** The problem `type` URIs the spec defines. */
export const PROBLEM_BASE = 'https://points-partner.example/problems/'

export const problemType = (slug: string) => PROBLEM_BASE + slug

/** The spec lets a partner choose which of these to send for a request it cannot authenticate. */
export const UNAUTHENTICATED = oneOf(
  problemType('missing-signature'),
  problemType('invalid-signature'),
  problemType('stale-timestamp'),
)

export const PROBLEM_JSON = { 'content-type': mediaType('application/problem+json') }
