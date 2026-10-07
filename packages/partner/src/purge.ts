import { REPLAY_MEMORY_SECONDS } from './app'

/**
 * What the partner forgets, and when.
 *
 * Every tenant leaves a signing secret, two members, their transactions and a
 * webhook-id for every request it made, and the suite hands out a tenant per
 * visitor session. Nothing deleted them: an expired tenant was refused, not
 * removed. Run from the partner's own cron, so it needs nothing from the
 * provider and the two sides still share no code.
 *
 * Bounded, because it must finish inside one invocation however much has
 * piled up. What is left over is deleted by the next run, ten minutes later;
 * nothing here can pick the same rows again, because it deletes them.
 */

/** Expired tenants removed per run, each with its members, transactions and ids. */
export const TENANTS_PURGED_PER_RUN = 50

/** Forgotten webhook-ids removed per run. */
export const IDS_PURGED_PER_RUN = 5000

export async function purge(
  db: D1Database,
  nowSeconds: number,
): Promise<{ tenants: number; ids: number }> {
  // The foreign keys on members, transactions and seen_messages cascade.
  const tenants = await db
    .prepare(
      `DELETE FROM tenants
        WHERE id IN (SELECT id FROM tenants WHERE expires_at <= ?1 ORDER BY expires_at LIMIT ?2)`,
    )
    .bind(nowSeconds, TENANTS_PURGED_PER_RUN)
    .run()

  // An id older than the memory window is one the replay check would already
  // accept again — it overwrites it — so forgetting it changes no answer.
  const ids = await db
    .prepare(
      `DELETE FROM seen_messages
        WHERE rowid IN (SELECT rowid FROM seen_messages WHERE seen_at < ?1 LIMIT ?2)`,
    )
    .bind(nowSeconds - REPLAY_MEMORY_SECONDS, IDS_PURGED_PER_RUN)
    .run()

  return { tenants: tenants.meta.changes, ids: ids.meta.changes }
}
