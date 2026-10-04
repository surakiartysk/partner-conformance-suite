import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

/**
 * Tests run inside workerd against a real local D1, not a mock of one.
 *
 * What is worth testing here lives at the database: that a redemption cannot
 * take a balance below zero even when two arrive at once, that a reference is
 * unique, that a transaction can be reversed only once. A fake `prepare()`
 * returning canned rows would prove none of it.
 *
 * Storage is shared across the tests in a file, so every test provisions its
 * own tenant and asserts against that, never against a global count.
 */

const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations, PROVISION_TOKEN: 'test-provision-token' },
      },
    }),
  ],
})
