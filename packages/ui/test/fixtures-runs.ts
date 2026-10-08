import type { CaseInfo, RunView, VersionInfo } from '../src/api'
import correctEarn from './fixtures/correct-earn.json'
import doubleEarn from './fixtures/double-earn-earn.json'
import plainErrors from './fixtures/plain-errors-member.json'
import slowBalance from './fixtures/slow-balance-member.json'

/**
 * Runs as the Worker answered them, captured from the real API against the real
 * reference partner: the shapes here are not guesses. `double-earn` has one
 * failure with a mismatch on two fields, `plain-errors` an answer that is not
 * JSON, `slow-balance` a step that got no answer.
 */
export const DOUBLE_EARN = doubleEarn as unknown as RunView
export const CORRECT = correctEarn as unknown as RunView
export const PLAIN_ERRORS = plainErrors as unknown as RunView
export const SLOW_BALANCE = slowBalance as unknown as RunView

const info = (id: string, name: string): CaseInfo => ({
  id,
  service: id.split('/')[0]!,
  name,
  description: `About ${name}`,
  member: 'A',
  writes: id.startsWith('earn'),
})

export const CASES: CaseInfo[] = [
  info('earn/adds-points', 'Earning adds exactly the points earned'),
  info('earn/duplicate-reference', 'Earning twice with one reference adds the points once'),
  info('earn/invalid-points', 'Earning zero points is refused'),
  info('earn/unknown-member', 'Earning for an unknown member is a 404'),
  info('member/known', 'A member is returned in the shape the spec gives'),
  info('member/unknown', 'An unknown member is a 404 problem'),
  info('member/balance', "A member's balance is readable"),
]

export const VERSIONS: VersionInfo[] = [
  { name: 'correct', bug: null, status: null, catches: [] },
  {
    name: 'double-earn',
    bug: 'ignores reference on an earn, so a repeated earn adds the points again',
    status: 'failed',
    catches: ['earn/duplicate-reference'],
  },
  {
    name: 'plain-errors',
    bug: 'answers an unknown member as plain text, not an RFC 9457 problem',
    status: 'failed',
    catches: ['member/unknown', 'earn/unknown-member'],
  },
  {
    name: 'slow-balance',
    bug: "takes longer than the runner's timeout to answer a balance read",
    status: 'timed_out',
    catches: ['member/balance'],
  },
]
