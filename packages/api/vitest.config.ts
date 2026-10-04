import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

/**
 * The runner's tests run in workerd, next to a real reference partner.
 *
 * The partner is the other side of the wire, so the tests give it its own D1
 * (`PARTNER_DB`) with its own migrations, and reach it through a transport
 * that calls its `fetch`. Production code in this package never imports the
 * partner; only these tests do, in the place a network would otherwise be.
 */

const partnerMigrations = await readD1Migrations(
  path.join(import.meta.dirname, '../partner/migrations'),
)

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2024-12-18',
        d1Databases: ['PARTNER_DB'],
        bindings: {
          PARTNER_MIGRATIONS: partnerMigrations,
          PARTNER_PROVISION_TOKEN: 'test-provision-token',
        },
      },
    }),
  ],
})
