import { earn } from './cases/earn'
import { members } from './cases/members'
import { redeem } from './cases/redeem'
import { reversal } from './cases/reversal'
import { security } from './cases/security'
import type { CaseDefinition } from './define'

export * from './compare'
export * from './define'
export * from './lanes'
export * from './matchers'
export * from './problems'

/** Every case, in the order the dashboard lists them. */
export const CASES: readonly CaseDefinition[] = [
  ...security,
  ...members,
  ...earn,
  ...redeem,
  ...reversal,
]
