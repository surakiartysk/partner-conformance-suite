import type { Context } from 'hono'
import { problem } from '../problems'
import type { Env } from '../types'

/**
 * The three operations that move points.
 *
 * Each movement is one D1 batch — a transaction — of two statements: an INSERT
 * of the transaction row that selects from `members` with the guard in its
 * WHERE clause, then an UPDATE of the balance that only applies if that row
 * now exists. There is no read of the balance followed by a write of it: two
 * redemptions arriving together would both pass such a read, and both be
 * applied. Here the second one's INSERT finds the balance already reduced and
 * inserts nothing.
 */

const MAX_POINTS = 1_000_000
const MAX_REFERENCE = 64

interface TransactionRow {
  id: string
  reference: string
  type: 'earn' | 'redeem' | 'reversal'
  member_id: string
  points: number
  balance_after: number
  reverses: string | null
}

/** What a request asked for, to tell a genuine repeat from a reused reference. */
type Intent =
  | { type: 'earn' | 'redeem'; memberId: string; points: number }
  | { type: 'reversal'; reverses: string }

function view(row: TransactionRow) {
  return {
    transactionId: row.id,
    type: row.type,
    memberId: row.member_id,
    points: row.points,
    balance: row.balance_after,
    ...(row.reverses ? { reverses: row.reverses } : {}),
  }
}

function matches(row: TransactionRow, intent: Intent): boolean {
  if (row.type !== intent.type) return false
  if (intent.type === 'reversal') return row.reverses === intent.reverses
  return row.member_id === intent.memberId && row.points === intent.points
}

function isUniqueViolation(error: unknown): boolean {
  return String(error).includes('UNIQUE constraint failed')
}

function newTransactionId(): string {
  return 'txn_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20)
}

/**
 * The body as JSON, or null when it is not JSON or is `null`. Anything else —
 * an array, a number — gets through here and is refused by the field checks,
 * which find none of the fields they need.
 */
function parseBody(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown> | null
  } catch {
    return null
  }
}

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_REFERENCE
}

async function findByReference(c: Context<Env>, reference: string) {
  return c.env.DB.prepare('SELECT * FROM transactions WHERE tenant = ? AND reference = ?')
    .bind(c.var.tenant.id, reference)
    .first<TransactionRow>()
}

async function findById(c: Context<Env>, id: string) {
  return c.env.DB.prepare('SELECT * FROM transactions WHERE tenant = ? AND id = ?')
    .bind(c.var.tenant.id, id)
    .first<TransactionRow>()
}

/**
 * The answer to a reference already used: the original result when the
 * payload is the same, a conflict when it is not, and null when it is new.
 */
async function answerRepeat(c: Context<Env>, reference: string, intent: Intent) {
  const row = await findByReference(c, reference)
  if (!row) return null
  return matches(row, intent) ? c.json(view(row)) : problem(c, 'reference-conflict')
}

/**
 * Inserts the transaction and moves the balance by `delta`, atomically.
 * `guard` is extra SQL on the member row, bound to `guardValue`; the insert
 * happens only if it holds. Returns the new row, or null if the guard failed.
 */
async function apply(
  c: Context<Env>,
  fields: { type: TransactionRow['type']; memberId: string; points: number; reference: string },
  delta: number,
  reverses: string | null,
  guard: { sql: string; value: number } | null,
): Promise<TransactionRow | null> {
  const db = c.env.DB
  const tenant = c.var.tenant.id
  const id = newTransactionId()
  const now = Math.floor(Date.now() / 1000)

  const insert = db
    .prepare(
      `INSERT INTO transactions
         (tenant, id, reference, type, member_id, points, balance_after, reverses, created_at)
       SELECT tenant, ?, ?, ?, id, ?, balance + ?, ?, ?
         FROM members
        WHERE tenant = ? AND id = ? ${guard ? `AND ${guard.sql}` : ''}`,
    )
    .bind(
      id,
      fields.reference,
      fields.type,
      fields.points,
      delta,
      reverses,
      now,
      tenant,
      fields.memberId,
      ...(guard ? [guard.value] : []),
    )
  const update = db
    .prepare(
      `UPDATE members SET balance = balance + ?
        WHERE tenant = ? AND id = ?
          AND EXISTS (SELECT 1 FROM transactions WHERE tenant = ? AND id = ?)`,
    )
    .bind(delta, tenant, fields.memberId, tenant, id)

  const [inserted] = await db.batch([insert, update])
  if (!inserted || inserted.meta.changes === 0) return null
  return findById(c, id)
}

async function move(c: Context<Env>, type: 'earn' | 'redeem'): Promise<Response> {
  const body = parseBody(c.var.rawBody)
  if (!body) return problem(c, 'invalid-request', 'body must be JSON')
  const { memberId, points, reference } = body
  if (typeof memberId !== 'string' || memberId.length === 0) {
    return problem(c, 'invalid-request', 'memberId must be a non-empty string')
  }
  if (
    typeof points !== 'number' ||
    !Number.isInteger(points) ||
    points < 1 ||
    points > MAX_POINTS
  ) {
    return problem(c, 'invalid-request', `points must be an integer from 1 to ${MAX_POINTS}`)
  }
  if (!validReference(reference)) {
    return problem(c, 'invalid-request', `reference must be 1 to ${MAX_REFERENCE} characters`)
  }

  const intent: Intent = { type, memberId, points }
  const repeat = await answerRepeat(c, reference, intent)
  if (repeat) return repeat

  const member = await c.env.DB.prepare('SELECT 1 FROM members WHERE tenant = ? AND id = ?')
    .bind(c.var.tenant.id, memberId)
    .first()
  if (!member) return problem(c, 'member-not-found')

  let row: TransactionRow | null
  try {
    row = await apply(
      c,
      { type, memberId, points, reference },
      type === 'earn' ? points : -points,
      null,
      type === 'redeem' ? { sql: 'balance >= ?', value: points } : null,
    )
  } catch (error) {
    // The same reference arriving twice at once: both passed the lookup
    // above, and the unique index let only one in. Answer the loser as the
    // repeat it is.
    if (isUniqueViolation(error)) {
      const again = await answerRepeat(c, reference, intent)
      if (again) return again
    }
    throw error
  }

  if (!row) return problem(c, 'insufficient-points')
  return c.json(view(row))
}

export const earn = (c: Context<Env>) => move(c, 'earn')
export const redeem = (c: Context<Env>) => move(c, 'redeem')

export async function reverse(c: Context<Env>): Promise<Response> {
  const body = parseBody(c.var.rawBody)
  if (!body) return problem(c, 'invalid-request', 'body must be JSON')
  const { transactionId, reference } = body
  if (typeof transactionId !== 'string' || transactionId.length === 0) {
    return problem(c, 'invalid-request', 'transactionId must be a non-empty string')
  }
  if (!validReference(reference)) {
    return problem(c, 'invalid-request', `reference must be 1 to ${MAX_REFERENCE} characters`)
  }

  const intent: Intent = { type: 'reversal', reverses: transactionId }
  const repeat = await answerRepeat(c, reference, intent)
  if (repeat) return repeat

  const original = await findById(c, transactionId)
  if (!original) return problem(c, 'transaction-not-found')
  if (original.type === 'reversal') return problem(c, 'not-reversible')

  const reversed = await c.env.DB.prepare(
    'SELECT 1 FROM transactions WHERE tenant = ? AND reverses = ?',
  )
    .bind(c.var.tenant.id, transactionId)
    .first()
  if (reversed) return problem(c, 'already-reversed')

  // Undoing an earn takes the points back, so it needs them to still be there.
  const undoingEarn = original.type === 'earn'
  let row: TransactionRow | null
  try {
    row = await apply(
      c,
      { type: 'reversal', memberId: original.member_id, points: original.points, reference },
      undoingEarn ? -original.points : original.points,
      transactionId,
      undoingEarn ? { sql: 'balance >= ?', value: original.points } : null,
    )
  } catch (error) {
    // Either index can be the one that refused: the reference, if this exact
    // request raced itself, or `reverses`, if a different one got there first.
    if (isUniqueViolation(error)) {
      return (await answerRepeat(c, reference, intent)) ?? problem(c, 'already-reversed')
    }
    throw error
  }

  if (!row) return problem(c, 'insufficient-points', 'the points earned have since been spent')
  return c.json(view(row))
}
