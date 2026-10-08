import type { PartnerVersion } from './partner'
import type { Context } from 'hono'

/**
 * What is wrong with each version of the reference partner, for the result page
 * to say once a run is over.
 *
 * This is a copy of the table in docs/variants.md, and a test holds the two
 * equal in both directions, so the page cannot tell a visitor something the
 * document does not say. The document is the source; edit it first.
 */
export interface VersionInfo {
  name: PartnerVersion
  /** What the version does wrong, or `null` for the one that does nothing wrong. */
  bug: string | null
  /** How the cases it must not pass end: `failed`, or `timed_out` for a partner that does not answer. */
  status: 'failed' | 'timed_out' | null
  /** The cases that must not pass against it. */
  catches: string[]
}

export const VERSIONS: VersionInfo[] = [
  { name: 'correct', bug: null, status: null, catches: [] },
  {
    name: 'ignores-signature',
    bug: 'never checks the signature, so a missing, wrong or tampered one is accepted',
    status: 'failed',
    catches: ['security/missing-signature', 'security/wrong-signature', 'security/tampered-body'],
  },
  {
    name: 'accepts-stale',
    bug: 'checks the signature but not the timestamp',
    status: 'failed',
    catches: ['security/stale-timestamp'],
  },
  {
    name: 'no-replay-guard',
    bug: 'does not remember the webhook-ids it has accepted',
    status: 'failed',
    catches: ['security/replayed-request'],
  },
  {
    name: 'double-earn',
    bug: 'ignores reference on an earn, so a repeated earn adds the points again',
    status: 'failed',
    catches: ['earn/duplicate-reference'],
  },
  {
    name: 'double-redeem',
    bug: 'ignores reference on a redemption, so a repeated redemption takes the points again',
    status: 'failed',
    catches: ['redeem/duplicate-reference'],
  },
  {
    name: 'off-by-one',
    bug: 'moves one point fewer than asked on an earn and on a redemption, while a reversal still takes back all of what was asked',
    status: 'failed',
    catches: [
      'earn/adds-points',
      'earn/duplicate-reference',
      'redeem/takes-points',
      'redeem/duplicate-reference',
      'reversal/undoes-earn',
      'reversal/twice',
    ],
  },
  {
    name: 'unvalidated-points',
    bug: "does not check points itself, so zero or a negative reaches the table's CHECK and comes back as a 500",
    status: 'failed',
    catches: ['earn/invalid-points', 'redeem/negative-points'],
  },
  {
    name: 'missing-tier',
    bug: 'omits tier from a member',
    status: 'failed',
    catches: ['member/known'],
  },
  {
    name: 'overdraws',
    bug: 'lets a redemption take the balance below zero',
    status: 'failed',
    catches: ['redeem/over-balance'],
  },
  {
    name: 'double-reversal',
    bug: 'lets one transaction be reversed more than once',
    status: 'failed',
    catches: ['reversal/twice'],
  },
  {
    name: 'plain-errors',
    bug: 'answers an unknown member as plain text, not an RFC 9457 problem',
    status: 'failed',
    catches: ['member/unknown', 'earn/unknown-member'],
  },
  {
    name: 'slow-balance',
    bug: "takes longer than the runner's timeout to answer a balance read",
    status: 'timed_out',
    catches: [
      'member/balance',
      'security/tampered-body',
      'earn/adds-points',
      'earn/duplicate-reference',
      'earn/invalid-points',
      'redeem/takes-points',
      'redeem/over-balance',
      'redeem/duplicate-reference',
      'redeem/negative-points',
      'reversal/undoes-earn',
      'reversal/twice',
    ],
  },
]

export function listVersions(c: Context): Response {
  return c.json(VERSIONS)
}
