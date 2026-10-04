/**
 * The reference partner's versions, each reached under its own path prefix.
 *
 * `correct` implements the spec. Every other version is `correct` with exactly
 * one behaviour switched off, so a red case points at one cause. A closed
 * list: anything else is a 404, and the suite builds the URL from this list
 * rather than from what a browser sends.
 *
 * Each flag is written so that `true` is the correct behaviour. A test holds
 * the one-bug rule: it fails if a version differs from `correct` in anything
 * but a single flag.
 */
export interface Behaviour {
  /** Verifies the HMAC. Off, a missing, wrong or tampered signature is accepted. */
  checksSignature: boolean
  /** Refuses a timestamp outside the tolerance. */
  checksTimestamp: boolean
  /** Refuses a webhook-id it has already accepted. */
  refusesReplays: boolean
  /** Treats a repeated reference on an earn as the same earn. */
  dedupesEarn: boolean
  /** Refuses a redemption larger than the balance. */
  guardsRedeem: boolean
  /** Refuses to reverse a transaction that has been reversed. */
  reversesOnce: boolean
  /** Answers an unknown member with an RFC 9457 problem, not plain text. */
  explainsUnknownMember: boolean
  /** Answers a balance read within the runner's timeout. */
  answersBalancePromptly: boolean
}

const CORRECT: Behaviour = {
  checksSignature: true,
  checksTimestamp: true,
  refusesReplays: true,
  dedupesEarn: true,
  guardsRedeem: true,
  reversesOnce: true,
  explainsUnknownMember: true,
  answersBalancePromptly: true,
}

const bug = (flag: keyof Behaviour): Behaviour => ({ ...CORRECT, [flag]: false })

export const VARIANTS = {
  correct: CORRECT,
  'ignores-signature': bug('checksSignature'),
  'accepts-stale': bug('checksTimestamp'),
  'no-replay-guard': bug('refusesReplays'),
  'double-earn': bug('dedupesEarn'),
  overdraws: bug('guardsRedeem'),
  'double-reversal': bug('reversesOnce'),
  'plain-errors': bug('explainsUnknownMember'),
  'slow-balance': bug('answersBalancePromptly'),
} as const satisfies Record<string, Behaviour>

export type Variant = keyof typeof VARIANTS

export const VARIANT_NAMES = Object.keys(VARIANTS) as Variant[]

export function isVariant(value: string): value is Variant {
  return Object.hasOwn(VARIANTS, value)
}

/**
 * How long a version without `answersBalancePromptly` sits on a balance read.
 * Longer than the runner's per-request timeout, so a request that waits for it
 * times out — and when the runner gives up and aborts, the wait ends too.
 */
export const SLOW_BALANCE_MS = 15_000

export function stall(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
