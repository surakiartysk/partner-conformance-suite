import { executeCase, type Target } from './runner/execute'
import { decrypt } from './secrets'
import type { Bindings, Session } from './types'

/**
 * Where a session's requests go. Built here, from the session and the
 * deployment's configuration — never from anything a request carries.
 */

/** The partner's versions the suite may be pointed at. A closed list. */
export const PARTNER_VERSIONS = [
  'correct',
  'ignores-signature',
  'accepts-stale',
  'no-replay-guard',
  'double-earn',
  'double-redeem',
  'off-by-one',
  'unvalidated-points',
  'missing-tier',
  'overdraws',
  'double-reversal',
  'plain-errors',
  'slow-balance',
] as const

export type PartnerVersion = (typeof PARTNER_VERSIONS)[number]

export function isPartnerVersion(value: unknown): value is PartnerVersion {
  return typeof value === 'string' && (PARTNER_VERSIONS as readonly string[]).includes(value)
}

export function baseUrl(env: Bindings, session: Session, version: PartnerVersion): string {
  return `${env.PARTNER_ORIGIN.replace(/\/+$/, '')}/${version}/${session.tenant}`
}

export async function targetFor(
  env: Bindings,
  session: Session,
  version: PartnerVersion,
): Promise<Target> {
  if (!env.SECRET_KEY) throw new Error('SECRET_KEY is not configured')
  return {
    baseUrl: baseUrl(env, session, version),
    secret: await decrypt(session.secret, env.SECRET_KEY),
    members: { A: session.member_a, B: session.member_b },
  }
}

export const transportFor = (env: Bindings) => (request: Request) => env.PARTNER.fetch(request)

/**
 * A member's balance as the partner reports it, or null if it does not answer
 * properly. Read through the runner, so it is signed and time-limited exactly
 * like a case.
 */
export async function readBalance(
  env: Bindings,
  target: Target,
  slot: 'A' | 'B',
  timeoutMs = 5_000,
): Promise<number | null> {
  const result = await executeCase(
    {
      id: 'session/balance',
      service: 'member',
      name: 'read a balance',
      description: '',
      member: slot,
      writes: false,
      act: {
        name: 'balance',
        request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}/balance` }),
        expect: () => ({ status: 200 }),
      },
    },
    target,
    { transport: transportFor(env), timeoutMs },
  )
  const balance = (result.steps[0]?.response?.body as { balance?: unknown } | undefined)?.balance
  return result.status === 'passed' && Number.isInteger(balance) ? (balance as number) : null
}
