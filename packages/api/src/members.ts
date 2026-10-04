import { defineCase, type CaseDefinition, type MemberSlot } from '@conformance/cases'
import { readBalance, targetFor, transportFor, type PartnerVersion } from './partner'
import { executeCase, type CaseResult } from './runner/execute'
import type { Bindings, Session } from './types'

/**
 * Holding a member, and giving their points back.
 *
 * A run moves real points on a partner's test member. Two things keep that
 * safe. A **lock** says who may move a member's balance right now, so two runs
 * never move it at once. A **baseline** says what the balance must be returned
 * to, and it is written to the database before any points move — so if the run
 * dies half way, the debt is still written down, and the next holder of the
 * member pays it.
 */

/** How long a lock lasts without a `next` renewing it. */
export const LOCK_SECONDS = 5 * 60

const now = () => Math.floor(Date.now() / 1000)

/**
 * Takes the member for `holder`, or renews it if `holder` has it already. One
 * statement: the upsert only replaces a lock that is this holder's own or has
 * expired, so of two runs reaching for a free member, one gets it.
 */
export async function acquire(
  db: D1Database,
  sessionId: string,
  slot: MemberSlot,
  holder: string,
): Promise<boolean> {
  const at = now()
  const result = await db
    .prepare(
      `INSERT INTO member_locks (session_id, slot, holder, expires_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (session_id, slot) DO UPDATE SET holder = ?3, expires_at = ?4
         WHERE member_locks.holder = ?3 OR member_locks.expires_at <= ?5`,
    )
    .bind(sessionId, slot, holder, at + LOCK_SECONDS, at)
    .run()
  return result.meta.changes === 1
}

export async function release(
  db: D1Database,
  sessionId: string,
  slot: MemberSlot,
  holder: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM member_locks WHERE session_id = ? AND slot = ? AND holder = ?')
    .bind(sessionId, slot, holder)
    .run()
}

/**
 * Makes sure the member's balance is written down before anything moves it.
 *
 * Called by whoever has just taken the lock. If a baseline exists it is kept:
 * it is an earlier run's debt, not yet paid, and the balance now is not the one
 * owed. Only the version to restore through is updated. If the balance cannot
 * be read, nothing is written and the answer says so — the cases will read it
 * themselves and fail or time out on their own terms.
 */
export async function ensureBaseline(
  env: Bindings,
  session: Session,
  slot: MemberSlot,
  version: PartnerVersion,
): Promise<{ target: number } | null> {
  const existing = await env.DB.prepare(
    'SELECT target FROM member_baselines WHERE session_id = ? AND slot = ?',
  )
    .bind(session.id, slot)
    .first<{ target: number }>()
  if (existing) {
    await env.DB.prepare(
      'UPDATE member_baselines SET version = ? WHERE session_id = ? AND slot = ?',
    )
      .bind(version, session.id, slot)
      .run()
    return existing
  }
  const balance = await readBalance(env, await targetFor(env, session, version), slot)
  if (balance === null) return null
  await env.DB.prepare(
    `INSERT INTO member_baselines (session_id, slot, target, version, recorded_at)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (session_id, slot) DO NOTHING`,
  )
    .bind(session.id, slot, balance, version, now())
    .run()
  return { target: balance }
}

/**
 * The restore, written as a case: read the balance, move the difference, read
 * it back. Being a case means it is signed, timed and recorded exactly like
 * the others, and its result can be shown the same way.
 *
 * The reference names the run, the member and the amount. Asked again for the
 * same amount — a retry after a timeout — the partner answers with the earlier
 * transaction instead of moving the points twice; asked for a different
 * amount, it is a different reference.
 */
function restoreCase(slot: MemberSlot, target: number, by: string): CaseDefinition {
  return defineCase({
    id: `restore/${slot}`,
    service: 'member',
    name: `Restore member ${slot} to ${target.toLocaleString('en-US')}`,
    description: 'Returns the balance to what it was before the run moved it.',
    member: slot,
    writes: true,
    act: {
      name: 'restore',
      request: (ctx) => {
        const delta = target - ctx.start.value
        if (delta === 0) return { method: 'GET', path: `/members/${ctx.member.id}/balance` }
        return {
          method: 'POST',
          path: delta > 0 ? '/points/earn' : '/points/redeem',
          body: {
            memberId: ctx.member.id,
            points: Math.abs(delta),
            reference: `rst_${by}_${slot}_${delta}`,
          },
        }
      },
      expect: () => ({ status: 200, body: { balance: target } }),
    },
    verify: [
      {
        name: 'balance',
        request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}/balance` }),
        expect: (ctx) => ({ status: 200, body: { memberId: ctx.member.id, balance: target } }),
      },
    ],
  })
}

export type Restore =
  | { status: 'nothing-owed' }
  | { status: 'restored'; target: number; result: CaseResult }
  | { status: 'not-restored'; target: number; result: CaseResult }

/**
 * Pays the member's debt, if there is one. The caller must hold the member.
 * The baseline is deleted only when the restore case passed — the balance was
 * read back and is the target — so a restore that fails, times out, or lands
 * on the wrong number leaves the debt where the next holder will find it.
 */
export async function restore(
  env: Bindings,
  session: Session,
  slot: MemberSlot,
  version: PartnerVersion,
  by: string,
): Promise<Restore> {
  const baseline = await env.DB.prepare(
    'SELECT target FROM member_baselines WHERE session_id = ? AND slot = ?',
  )
    .bind(session.id, slot)
    .first<{ target: number }>()
  if (!baseline) return { status: 'nothing-owed' }

  const result = await executeCase(
    restoreCase(slot, baseline.target, by),
    await targetFor(env, session, version),
    { transport: transportFor(env) },
  )
  if (result.status !== 'passed') {
    return { status: 'not-restored', target: baseline.target, result }
  }
  await env.DB.prepare(
    'DELETE FROM member_baselines WHERE session_id = ? AND slot = ? AND target = ?',
  )
    .bind(session.id, slot, baseline.target)
    .run()
  return { status: 'restored', target: baseline.target, result }
}
