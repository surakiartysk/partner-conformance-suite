import { env, applyD1Migrations, createExecutionContext } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { app as partner } from '../../partner/src/app'
import { newSecret } from '../src/runner/signing'
import type { Target } from '../src/runner/execute'
import api from '../src/index'
import type { Bindings } from '../src/types'

declare global {
  namespace Cloudflare {
    interface Env extends Omit<Bindings, 'PARTNER'> {
      TEST_MIGRATIONS: D1Migration[]
      PARTNER_DB: D1Database
      PARTNER_MIGRATIONS: D1Migration[]
      PARTNER_PROVISION_TOKEN: string
    }
  }
}

export const migratePartner = () => applyD1Migrations(env.PARTNER_DB, env.PARTNER_MIGRATIONS)

/** Both databases: the suite's own, and the reference partner's. */
export const migrateAll = async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await migratePartner()
}

/** The network, as far as these tests are concerned: straight into the partner's `fetch`. */
export const toPartner = (request: Request): Promise<Response> =>
  Promise.resolve(
    partner.fetch(
      request,
      { DB: env.PARTNER_DB, PROVISION_TOKEN: env.PARTNER_PROVISION_TOKEN },
      createExecutionContext(),
    ),
  )

/** A fresh tenant on the reference partner, as the dashboard will make one per session. */
export async function provisionTarget(variant = 'correct'): Promise<Target> {
  const tenant = 't-' + crypto.randomUUID()
  const secret = newSecret()
  const response = await toPartner(
    new Request('https://partner.example/_provision', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.PARTNER_PROVISION_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ tenant, secret }),
    }),
  )
  if (response.status !== 201) throw new Error(`provision failed: ${response.status}`)
  const { members } = await response.json<{ members: { id: string }[] }>()
  return {
    baseUrl: `https://partner.example/${variant}/${tenant}`,
    secret,
    members: { A: members[0]!.id, B: members[1]!.id },
  }
}

/** The API Worker's bindings, with the partner reached through `toPartner`. */
export const apiEnv = (overrides: Partial<Bindings> = {}): Bindings => ({
  ...(env as unknown as Bindings),
  PARTNER: { fetch: toPartner } as unknown as Fetcher,
  ...overrides,
})

/** Calls the API Worker the way a browser would; `path` is below `/api`, where every route lives. */
export async function callApi(
  path: string,
  init: RequestInit = {},
  overrides: Partial<Bindings> = {},
): Promise<Response> {
  return api.fetch(
    new Request(`https://suite.example/api${path}`, init),
    apiEnv(overrides),
    createExecutionContext(),
  )
}

/** The cookie a response set, ready to send back. */
export function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? ''
  return header.split(';')[0]!
}

/** A fresh session, from an address of its own so the rate limit stays out of the way. */
export async function startSession(): Promise<{ cookie: string; body: SessionView }> {
  const response = await callApi('/sessions', {
    method: 'POST',
    headers: { 'cf-connecting-ip': `client-${crypto.randomUUID()}` },
  })
  if (response.status !== 201) throw new Error(`session failed: ${response.status}`)
  return { cookie: cookieFrom(response), body: await response.json<SessionView>() }
}

export interface SessionView {
  expiresAt: string
  partner: { tenant: string; versions: string[] }
  members: { slot: 'A' | 'B'; id: string; balance?: number | null }[]
  secret: { revealed: boolean }
}

export interface NextAnswer {
  lane: string
  done: boolean
  position?: number
  total?: number
  result?: { caseId: string; status: string }
  restore?: { status: string; target?: number } | null
  error?: string
}

export async function createRun(cookie: string, body: unknown): Promise<Response> {
  return callApi('/runs', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function next(cookie: string, runId: string, lane: string): Promise<Response> {
  return callApi(`/runs/${runId}/lanes/${lane}/next`, { method: 'POST', headers: { cookie } })
}

/** Calls `next` on a lane until it is done; returns every answer. */
export async function driveLane(
  cookie: string,
  runId: string,
  lane: string,
): Promise<NextAnswer[]> {
  const answers: NextAnswer[] = []
  for (let i = 0; i < 50; i++) {
    const response = await next(cookie, runId, lane)
    const answer = await response.json<NextAnswer>()
    if (response.status !== 200) throw new Error(`${lane}: ${response.status} ${answer.error}`)
    answers.push(answer)
    if (answer.done) return answers
  }
  throw new Error(`${lane} never finished`)
}

export async function balances(cookie: string): Promise<(number | null | undefined)[]> {
  const session = await (await callApi('/session', { headers: { cookie } })).json<SessionView>()
  return session.members.map((m) => m.balance)
}
