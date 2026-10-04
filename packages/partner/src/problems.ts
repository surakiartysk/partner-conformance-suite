import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from './types'

/**
 * Every error the partner returns, as an RFC 9457 problem document.
 *
 * The slugs here are the ones the spec lists. The two at the end are not in
 * the spec: they belong to this reference partner's own routing, which a real
 * partner would not have.
 */
export const PROBLEMS = {
  'invalid-request': [400, 'Invalid request'],
  'missing-signature': [401, 'Missing signature'],
  'invalid-signature': [401, 'Invalid signature'],
  'stale-timestamp': [401, 'Stale timestamp'],
  'member-not-found': [404, 'Member not found'],
  'transaction-not-found': [404, 'Transaction not found'],
  'replayed-request': [409, 'Replayed request'],
  'reference-conflict': [409, 'Reference already used'],
  'already-reversed': [409, 'Already reversed'],
  'insufficient-points': [422, 'Insufficient points'],
  'not-reversible': [422, 'Not reversible'],
  'not-found': [404, 'Not found'],
  'unknown-tenant': [404, 'Unknown tenant'],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string]>

export type ProblemSlug = keyof typeof PROBLEMS

export const PROBLEM_BASE = 'https://points-partner.example/problems/'

export function problem(c: Context, slug: ProblemSlug, detail?: string): Response {
  const [status, title] = PROBLEMS[slug]
  // The one place a version of this partner answers an error wrongly: an
  // unknown member as plain text. `behaviour` is not set yet for the errors
  // raised before a request is authenticated, which are never this one.
  const behaviour = (c as Context<Env>).get('behaviour')
  if (slug === 'member-not-found' && behaviour && !behaviour.explainsUnknownMember) {
    return c.text(title, status)
  }
  const body = { type: PROBLEM_BASE + slug, title, status, ...(detail ? { detail } : {}) }
  return c.body(JSON.stringify(body), status, { 'content-type': 'application/problem+json' })
}
