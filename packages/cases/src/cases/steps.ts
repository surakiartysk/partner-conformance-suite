import type { CaseContext, Expectation, Step } from '../define'
import type { Matcher } from '../matchers'
import { PROBLEM_JSON, problemType } from '../problems'

/** Reading the member's balance back, expecting `balance` to match. */
export const balanceIs = (expected: (ctx: CaseContext) => Matcher): Step => ({
  name: 'balance',
  request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}/balance` }),
  expect: (ctx) => ({ status: 200, body: { memberId: ctx.member.id, balance: expected(ctx) } }),
})

export const balanceUnchanged = balanceIs((ctx) => ctx.start.unchanged())

export const problem = (status: number, slug: string): Expectation => ({
  status,
  headers: PROBLEM_JSON,
  body: { type: problemType(slug), status },
})

export const transactionId = (ctx: CaseContext, step: string) =>
  (ctx.steps[step]?.body as { transactionId?: string } | undefined)?.transactionId ?? ''
