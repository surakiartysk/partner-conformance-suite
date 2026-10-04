import {
  Quantity,
  compare,
  describeExpected,
  type CaseContext,
  type CaseDefinition,
  type Expectation,
  type MemberSlot,
  type Mismatch,
  type Replay,
  type RequestSpec,
  type Step,
} from '@conformance/cases'
import { newSecret, sign } from './signing'

/**
 * Running one case against one partner.
 *
 * Everything sent is built here, from the case definition and the target the
 * server chose: the URL, the body, the headers, the signature. Nothing comes
 * from whoever asked for the run, and the verdict is reached here too — which
 * is the whole of what stops a partner from certifying itself.
 */

export interface Target {
  /** The partner's base URL. Paths in a case are appended to it. */
  baseUrl: string
  secret: string
  members: Record<MemberSlot, string>
}

export interface RunnerOptions {
  /** How a request reaches the partner. `fetch`, except in tests. */
  transport?: (request: Request) => Promise<Response>
  /** Per request. A partner slower than this has timed out, not failed. */
  timeoutMs?: number
  now?: () => number
  randomId?: () => string
}

export type CaseStatus = 'passed' | 'failed' | 'timed_out' | 'error'
export type Phase = 'start' | 'arrange' | 'act' | 'verify'

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: string
}

export interface RecordedResponse {
  status: number
  headers: Record<string, string>
  /** Parsed when the body was JSON; the raw text otherwise. */
  body: unknown
  json: boolean
  /** True when the body was longer than the limit and only its start was kept. */
  truncated: boolean
}

export interface StepRecord {
  phase: Phase
  name: string
  request: RecordedRequest
  response?: RecordedResponse
  /** The expectation as it reads on the result page — matchers described. */
  expected?: unknown
  mismatches: Mismatch[]
  outcome: 'ok' | 'mismatch' | 'timed_out' | 'error'
  error?: string
  durationMs: number
}

export interface CaseResult {
  caseId: string
  status: CaseStatus
  steps: StepRecord[]
  durationMs: number
}

export const DEFAULT_TIMEOUT_MS = 10_000

/** The most of a response body kept. A partner can send anything; storage must not fill with it. */
export const BODY_LIMIT_BYTES = 64 * 1024

/**
 * Headers shown on the result page. Everything else is shown by name with its
 * value hidden. An allowlist rather than a denylist: if a partner answers with
 * a header nobody anticipated that carries a token, a denylist would show it
 * and an allowlist cannot.
 */
export const VISIBLE_HEADERS = new Set([
  'content-type',
  'webhook-id',
  'webhook-timestamp',
  'webhook-signature',
])

export const HIDDEN = '•••'

class Timeout extends Error {}

function redact(headers: Headers): Record<string, string> {
  const shown: Record<string, string> = {}
  headers.forEach((value, name) => {
    shown[name] = VISIBLE_HEADERS.has(name.toLowerCase()) ? value : HIDDEN
  })
  return shown
}

async function readLimited(response: Response): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: '', truncated: false }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const room = BODY_LIMIT_BYTES - received
    if (value.byteLength > room) {
      text += decoder.decode(value.subarray(0, room))
      await reader.cancel()
      return { text, truncated: true }
    }
    received += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  return { text: text + decoder.decode(), truncated: false }
}

function parse(text: string, truncated: boolean): { body: unknown; json: boolean } {
  if (truncated) return { body: text, json: false }
  try {
    return { body: JSON.parse(text), json: true }
  } catch {
    return { body: text, json: false }
  }
}

function judge(expectation: Expectation, response: RecordedResponse, raw: Headers): Mismatch[] {
  const mismatches: Mismatch[] = []
  if (response.status !== expectation.status) {
    mismatches.push({
      path: 'status',
      expected: String(expectation.status),
      actual: response.status,
    })
  }
  for (const [name, expected] of Object.entries(expectation.headers ?? {})) {
    const actual = raw.get(name)
    const found = compare(expected, actual ?? undefined, `header ${name.toLowerCase()}`)
    mismatches.push(
      ...(actual === null
        ? found.map(({ path, expected }) => ({ path, expected, missing: true as const }))
        : found),
    )
  }
  if ('body' in expectation) mismatches.push(...compare(expectation.body, response.body))
  return mismatches
}

export async function executeCase(
  definition: CaseDefinition,
  target: Target,
  options: RunnerOptions = {},
): Promise<CaseResult> {
  const transport = options.transport ?? ((request: Request) => fetch(request))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? Date.now
  const randomId = options.randomId ?? (() => crypto.randomUUID().replaceAll('-', '').slice(0, 20))

  const began = now()
  const steps: StepRecord[] = []
  const sent = new Map<string, { url: string; init: RequestInit; recorded: RecordedRequest }>()
  const refs = new Map<string, string>()
  let start: Quantity | undefined

  const ctx: CaseContext = {
    member: { id: target.members[definition.member] },
    get start(): Quantity {
      if (!start) throw new Error(`${definition.id} reads a starting balance but does not write`)
      return start
    },
    steps: {},
    ref(label = '') {
      if (!refs.has(label)) refs.set(label, `ref_${randomId()}`)
      return refs.get(label)!
    },
    unknownId: (prefix) => `${prefix}unknown_${randomId()}`,
  }

  async function build(spec: RequestSpec) {
    const body = spec.body === undefined ? '' : JSON.stringify(spec.body)
    const fault = spec.fault ?? {}
    const id = `msg_${randomId()}`
    const timestamp = String(Math.floor(now() / 1000) + (fault.timestampOffset ?? 0))
    const secret = fault.wrongSecret ? newSecret() : target.secret
    const headers: Record<string, string> = {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': await sign(secret, id, timestamp, body),
    }
    if (fault.omit) delete headers[fault.omit]
    if (body) headers['content-type'] = 'application/json'
    const wire = fault.tamper ? fault.tamper(body) : body
    const url = target.baseUrl.replace(/\/+$/, '') + spec.path
    return {
      url,
      init: { method: spec.method, headers, body: spec.method === 'GET' ? undefined : wire },
      recorded: { method: spec.method, path: spec.path, headers: { ...headers }, body: wire },
    }
  }

  async function send(url: string, init: RequestInit) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Timeout())
      }, timeoutMs)
    })
    try {
      // Raced as well as aborted: a transport that ignores the signal still
      // cannot hold the case past its timeout.
      const response = await Promise.race([
        transport(new Request(url, { ...init, signal: controller.signal })),
        timedOut,
      ])
      const { text, truncated } = await Promise.race([readLimited(response), timedOut])
      return { response, text, truncated }
    } finally {
      clearTimeout(timer)
    }
  }

  async function run(phase: Phase, step: Step): Promise<StepRecord> {
    const stepBegan = now()
    const spec = step.request(ctx)
    let built: { url: string; init: RequestInit; recorded: RecordedRequest }
    if ('replayOf' in spec) {
      const original = sent.get((spec as Replay).replayOf)
      if (!original) throw new Error(`${definition.id}: no step named ${(spec as Replay).replayOf}`)
      built = original
    } else {
      built = await build(spec)
    }
    sent.set(step.name, built)

    const record: StepRecord = {
      phase,
      name: step.name,
      request: built.recorded,
      mismatches: [],
      outcome: 'ok',
      durationMs: 0,
    }
    try {
      const { response, text, truncated } = await send(built.url, built.init)
      const { body, json } = parse(text, truncated)
      record.response = {
        status: response.status,
        headers: redact(response.headers),
        body,
        json,
        truncated,
      }
      ctx.steps[step.name] = { status: response.status, body }

      if (step.expect) {
        const expectation = step.expect(ctx)
        record.expected = describeExpected(expectation)
        record.mismatches = judge(expectation, record.response, response.headers)
      } else {
        // An arrange step with nothing more specific to say only has to work.
        record.expected = { status: 'any 2xx' }
        if (!response.ok) {
          record.mismatches = [{ path: 'status', expected: 'any 2xx', actual: response.status }]
        }
      }
      if (record.mismatches.length > 0) record.outcome = 'mismatch'
    } catch (error) {
      record.outcome = error instanceof Timeout ? 'timed_out' : 'error'
      record.error = error instanceof Timeout ? `no response within ${timeoutMs} ms` : String(error)
    }
    record.durationMs = now() - stepBegan
    steps.push(record)
    return record
  }

  const finish = (status: CaseStatus): CaseResult => ({
    caseId: definition.id,
    status,
    steps,
    durationMs: now() - began,
  })

  // The starting balance every expectation about a balance is relative to.
  // Read fresh for each case, never assumed: the member may have been used by
  // anyone since the last run.
  if (definition.writes) {
    const read = await run('start', {
      name: 'balance at start',
      request: () => ({ method: 'GET', path: `/members/${ctx.member.id}/balance` }),
      expect: () => ({ status: 200 }),
    })
    const balance = (read.response?.body as { balance?: unknown } | undefined)?.balance
    if (read.outcome !== 'ok' || !Number.isInteger(balance)) return finish('error')
    start = new Quantity('balance at start', balance as number)
  }

  for (const step of definition.arrange ?? []) {
    if ((await run('arrange', step)).outcome !== 'ok') return finish('error')
  }

  let status: CaseStatus = 'passed'
  for (const [phase, step] of [
    ['act', definition.act] as const,
    ...(definition.verify ?? []).map((s) => ['verify', s] as const),
  ]) {
    const record = await run(phase, step)
    if (record.outcome === 'timed_out') return finish('timed_out')
    if (record.outcome === 'error') return finish('error')
    if (record.outcome === 'mismatch') status = 'failed'
  }
  return finish(status)
}
