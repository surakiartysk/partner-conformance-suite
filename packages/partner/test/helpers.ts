import { env, applyD1Migrations, createExecutionContext } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import worker from '../src/index'
import type { Bindings } from '../src/types'

/**
 * Shared setup for the partner's tests.
 *
 * Every test goes through the exported `fetch`, so the middleware that checks
 * the variant, the tenant, the signature and the replay is always in the path.
 *
 * The signer here is written separately from `src/signature.ts` on purpose.
 * A test that signed with the code under test would agree with it whatever it
 * did; this one is pinned to the standard's published vector instead (see
 * signature.test.ts), so the two can disagree when one of them is wrong.
 */

declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export const migrate = () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

export const PROVISION_TOKEN = 'test-provision-token'

export async function call(
  path: string,
  init: RequestInit = {},
  bindings: Partial<Bindings> = {},
): Promise<Response> {
  return worker.fetch(
    new Request(`http://partner.test${path}`, init),
    { ...env, ...bindings },
    createExecutionContext(),
  )
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

export function newSecret(): string {
  return 'whsec_' + base64(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sign(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  )
  return `v1,${base64(new Uint8Array(mac))}`
}

export interface Member {
  id: string
  name: string
  tier: string
  balance: number
}

export interface Tenant {
  id: string
  secret: string
  members: [Member, Member]
}

export async function provisionTenant(variant = 'correct'): Promise<Tenant & { variant: string }> {
  const id = 't-' + crypto.randomUUID()
  const secret = newSecret()
  const response = await call('/_provision', {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: id, secret }),
  })
  if (response.status !== 201) throw new Error(`provision failed: ${response.status}`)
  const { members } = await response.json<{ members: [Member, Member] }>()
  return { id, secret, members, variant }
}

export interface SignedOptions {
  body?: unknown
  /** Overrides, to build requests that should be refused. */
  id?: string
  timestamp?: string
  signature?: string
  secret?: string
  omit?: 'id' | 'timestamp' | 'signature'
  /** Changes the body after signing it. */
  tamper?: (body: string) => string
  signal?: AbortSignal
}

export const nowSeconds = () => Math.floor(Date.now() / 1000)

/** Sends a request to the tenant's partner, signed the way the provider would. */
export async function signed(
  tenant: Tenant & { variant: string },
  method: 'GET' | 'POST',
  path: string,
  options: SignedOptions = {},
): Promise<Response> {
  const body = options.body === undefined ? '' : JSON.stringify(options.body)
  const id = options.id ?? 'msg_' + crypto.randomUUID()
  const timestamp = options.timestamp ?? String(nowSeconds())
  const signature =
    options.signature ?? (await sign(options.secret ?? tenant.secret, id, timestamp, body))

  const headers: Record<string, string> = {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': signature,
  }
  if (options.omit) delete headers[`webhook-${options.omit}`]
  if (body) headers['content-type'] = 'application/json'

  return call(`/${tenant.variant}/${tenant.id}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : options.tamper ? options.tamper(body) : body,
    signal: options.signal,
  })
}

export async function balanceOf(tenant: Tenant & { variant: string }, memberId: string) {
  const response = await signed(tenant, 'GET', `/members/${memberId}/balance`)
  const { balance } = await response.json<{ balance: number }>()
  return balance
}

export async function problemType(response: Response): Promise<string> {
  const body = await response.json<{ type: string }>()
  return body.type.replace('https://points-partner.example/problems/', '')
}
