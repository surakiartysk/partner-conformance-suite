import { env, applyD1Migrations, createExecutionContext } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { app as partner } from '../../partner/src/app'
import { newSecret } from '../src/runner/signing'
import type { Target } from '../src/runner/execute'

declare global {
  namespace Cloudflare {
    interface Env {
      PARTNER_DB: D1Database
      PARTNER_MIGRATIONS: D1Migration[]
      PARTNER_PROVISION_TOKEN: string
    }
  }
}

export const migratePartner = () => applyD1Migrations(env.PARTNER_DB, env.PARTNER_MIGRATIONS)

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
