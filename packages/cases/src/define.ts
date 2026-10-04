import type { Matcher, Quantity } from './matchers'

/**
 * The shape of a case.
 *
 * A case is three phases. **arrange** puts the partner in the state the case
 * needs — an earn to reverse, a request to replay — and is not judged: if it
 * goes wrong the case ends as `error`, because nothing it then said about the
 * partner would mean anything. **act** is the request under test, and
 * **verify** reads back what it should have changed; both are judged.
 *
 * Every request a case makes is built from this definition by the runner on
 * the provider's side. Nothing in it comes from a browser.
 */

export type Service = 'security' | 'member' | 'earn' | 'redeem' | 'reversal'

export type MemberSlot = 'A' | 'B'

/** Ways to sign a request wrongly, for the cases that check a partner refuses it. */
export interface SigningFault {
  omit?: 'webhook-id' | 'webhook-timestamp' | 'webhook-signature'
  /** Sign with a secret the partner was never given. */
  wrongSecret?: true
  /** Seconds added to the timestamp before signing. */
  timestampOffset?: number
  /** Change the body after signing it. */
  tamper?: (body: string) => string
}

export interface RequestSpec {
  method: 'GET' | 'POST'
  /** Relative to the partner's base URL, starting with `/`. */
  path: string
  body?: unknown
  fault?: SigningFault
}

/** Send the earlier step's request again, byte for byte — same id, same signature. */
export interface Replay {
  replayOf: string
}

export interface Expectation {
  status: number
  /** Header names are matched case-insensitively. Unlisted headers are not checked. */
  headers?: Record<string, string | Matcher>
  body?: unknown
}

export interface StepOutcome {
  status: number
  body: unknown
}

export interface CaseContext {
  /** The member this case is about. */
  member: { id: string }
  /** The member's balance read just before the case began; set when the case writes. */
  start: Quantity
  /** Outcomes of the steps already run, by name. */
  steps: Record<string, StepOutcome>
  /** A reference unique to this run of this case — the same value each time it is called with the same label. */
  ref(label?: string): string
  /** An id no partner will have issued. */
  unknownId(prefix: string): string
}

export interface Step {
  name: string
  request: (ctx: CaseContext) => RequestSpec | Replay
  /** Required for act and verify steps. An arrange step without one only has to answer 2xx. */
  expect?: (ctx: CaseContext) => Expectation
}

export interface CaseDefinition {
  /** Stable, used in URLs and in the variant table: `earn/duplicate-reference`. */
  id: string
  service: Service
  name: string
  description: string
  /** Which test member the case is about. */
  member: MemberSlot
  /**
   * Whether the case can change the member's balance — even only if the
   * partner is wrong. Cases that write run one at a time per member; the rest
   * run alongside anything.
   */
  writes: boolean
  arrange?: Step[]
  act: Step
  verify?: Step[]
}

export function defineCase(definition: CaseDefinition): CaseDefinition {
  return definition
}
