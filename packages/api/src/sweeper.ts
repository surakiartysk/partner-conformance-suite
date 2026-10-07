import type { MemberSlot } from '@conformance/cases'
import { acquire, release, restore } from './members'
import { isPartnerVersion } from './partner'
import { SESSION_START_WINDOW_SECONDS } from './sessions'
import type { Bindings, Session } from './types'

/**
 * The cron sweep: debts nobody came back for, sessions that have ended, and
 * rate-limit counters whose window has passed.
 *
 * A run that dies, or a visitor who closes the tab, leaves a baseline — points
 * owed back to a member — and no one to pay it. The sweep takes each such
 * member it can lock and restores it through the version it was last used
 * with. A member another run still holds is left alone: that run will restore
 * it, or its lock will lapse and a later sweep will.
 */

/** Members restored per sweep, so one sweep stays within a Worker's limits. */
export const SWEEP_BATCH = 20

export const SWEEPER = 'sweeper'

const now = () => Math.floor(Date.now() / 1000)

export async function sweep(env: Bindings): Promise<{ restored: number; skipped: number }> {
  // Ended sessions take their runs, locks and baselines with them. Their
  // tenants have expired on the partner too, so there is nothing to restore.
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()).run()

  // A start counted in a window that has passed is one the rate limit would
  // already reset to a count of one, so the row can go.
  await env.DB.prepare('DELETE FROM session_starts WHERE window_start <= ?')
    .bind(now() - SESSION_START_WINDOW_SECONDS)
    .run()

  const owed = await env.DB.prepare(
    `SELECT b.slot, b.version, s.*
       FROM member_baselines b JOIN sessions s ON s.id = b.session_id
      ORDER BY b.last_attempt_at, b.recorded_at LIMIT ?`,
  )
    .bind(SWEEP_BATCH)
    .all<Session & { slot: MemberSlot; version: string }>()

  // Every row taken is marked as attempted now, before any is tried — the ones
  // that are skipped as much as the ones that fail. Oldest-first alone would
  // take the same rows every time: a debt that cannot be paid, or a member a
  // live run holds, stays in the batch and keeps out the newer ones behind it.
  if (owed.results.length > 0) {
    const attempted = env.DB.prepare(
      'UPDATE member_baselines SET last_attempt_at = ? WHERE session_id = ? AND slot = ?',
    )
    await env.DB.batch(owed.results.map((row) => attempted.bind(now(), row.id, row.slot)))
  }

  let restored = 0
  let skipped = 0
  for (const row of owed.results) {
    if (!isPartnerVersion(row.version) || !(await acquire(env.DB, row.id, row.slot, SWEEPER))) {
      skipped++
      continue
    }
    try {
      const outcome = await restore(env, row, row.slot, row.version, `swp_${now()}`)
      if (outcome.status === 'restored') restored++
    } finally {
      await release(env.DB, row.id, row.slot, SWEEPER)
    }
  }
  return { restored, skipped }
}
