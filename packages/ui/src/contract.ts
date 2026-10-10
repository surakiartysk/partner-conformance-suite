/**
 * What the For partners page says about the contract, as data.
 *
 * Written out by hand rather than parsed from `openapi.yaml` in the page: the
 * page would carry a YAML parser for five rows. A test reads the spec and holds
 * these rows to it — every operation, its method, its summary and the statuses
 * it answers with — so the page cannot describe an API the spec does not.
 */

export interface Operation {
  method: 'GET' | 'POST'
  path: string
  summary: string
  /** Every status the spec lists for it, in order. */
  statuses: number[]
}

export const OPERATIONS: readonly Operation[] = [
  {
    method: 'GET',
    path: '/members/{memberId}',
    summary: 'Read a member',
    statuses: [200, 401, 404, 409],
  },
  {
    method: 'GET',
    path: '/members/{memberId}/balance',
    summary: "Read a member's balance",
    statuses: [200, 401, 404, 409],
  },
  {
    method: 'POST',
    path: '/points/earn',
    summary: "Add points to a member's balance",
    statuses: [200, 400, 401, 404, 409],
  },
  {
    method: 'POST',
    path: '/points/redeem',
    summary: "Take points from a member's balance",
    statuses: [200, 400, 401, 404, 409, 422],
  },
  {
    method: 'POST',
    path: '/points/reversals',
    summary: 'Undo an earn or a redemption',
    statuses: [200, 400, 401, 404, 409, 422],
  },
]

/**
 * One signed request, worked through.
 *
 * The secret is the one Standard Webhooks publishes for its own test vector, so
 * it is public on purpose and signs nothing real. A test recomputes the
 * signature from the other four values, independently of both the suite's
 * signer and the partner's verifier.
 */
export const EXAMPLE = {
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  id: 'msg_2f6c1d0a9b8e4c7d5a31',
  timestamp: '1760169600',
  body: '{"memberId":"mbr_a","points":100,"reference":"ref_7c0e9a4b2d1f6e8a3c50"}',
  signature: 'v1,q7pPqDCGayqCgJjEY2z2otKT+XO+1fQrlJ5MNBVkOAU=',
} as const
