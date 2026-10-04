import type { Context } from 'hono'
import { problem } from '../problems'
import type { Env } from '../types'
import { SLOW_BALANCE_MS, stall } from '../variants'

export async function getMember(c: Context<Env>): Promise<Response> {
  const member = await c.env.DB.prepare(
    'SELECT id, name, tier FROM members WHERE tenant = ? AND id = ?',
  )
    .bind(c.var.tenant.id, c.req.param('memberId'))
    .first<{ id: string; name: string; tier: string }>()
  if (!member) return problem(c, 'member-not-found')
  return c.json(member)
}

export async function getBalance(c: Context<Env>): Promise<Response> {
  if (!c.var.behaviour.answersBalancePromptly) await stall(SLOW_BALANCE_MS, c.req.raw.signal)
  const row = await c.env.DB.prepare('SELECT id, balance FROM members WHERE tenant = ? AND id = ?')
    .bind(c.var.tenant.id, c.req.param('memberId'))
    .first<{ id: string; balance: number }>()
  if (!row) return problem(c, 'member-not-found')
  return c.json({ memberId: row.id, balance: row.balance })
}
