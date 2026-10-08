/**
 * The page's side of the wire: what it may ask the API, and what it gets back.
 *
 * The page names a session, a run and a lane. It never says where a request
 * goes or what it contains — those are the server's (decision 22), and nothing
 * here could express them.
 */

export interface SessionView {
  expiresAt: string
  partner: {
    tenant: string
    versions: string[]
    /** One address per version, as the runner builds it. */
    baseUrls: Record<string, string>
  }
  members: { slot: 'A' | 'B'; id: string; balance?: number | null }[]
  secret: { revealed: boolean }
}

export interface CaseInfo {
  id: string
  service: string
  name: string
  description: string
  member: 'A' | 'B'
  writes: boolean
}

export type CaseStatus = 'passed' | 'failed' | 'timed_out' | 'error'
export type Lane = 'read' | 'A' | 'B'

/** What happened to a member's points at the end of its lane. */
export type Restore =
  { status: 'nothing-owed' } | { status: 'restored' | 'not-restored'; target: number }

/** One disagreement between what a case expected and what arrived. */
export interface Mismatch {
  /** Where, as a JSON path (`$.balance`), or `status`, or `header <name>`. */
  path: string
  /** What was expected, as the case words it: a literal or a matcher's description. */
  expected: string
  actual?: unknown
  missing?: true
}

export type Phase = 'start' | 'arrange' | 'act' | 'verify'

export interface RecordedRequest {
  method: string
  path: string
  /** Every header as sent. */
  headers: Record<string, string>
  /** The body exactly as sent: JSON text, or empty. */
  body: string
}

export interface RecordedResponse {
  status: number
  /** An allowlist is shown; the rest are named with their value replaced by `•••`. */
  headers: Record<string, string>
  /** Parsed when the body was JSON; the raw text otherwise. Anything a partner wrote. */
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
  /** The expectation as the case words it; matchers read as `‹description›`. */
  expected?: { status?: number | string; headers?: Record<string, unknown>; body?: unknown }
  mismatches: Mismatch[]
  outcome: 'ok' | 'mismatch' | 'timed_out' | 'error'
  /** Set when the step did not get an answer. Text the server wrote about a failure. */
  error?: string
  durationMs: number
}

export interface CaseResult {
  caseId: string
  status: CaseStatus
  steps: StepRecord[]
  durationMs: number
}

export interface RunView {
  id: string
  version: string
  services: string[]
  createdAt: string
  finishedAt: string | null
  lanes: { lane: Lane; cases: string[]; position: number; done: boolean; restore: Restore | null }[]
  results: { caseId: string; lane: Lane; status: CaseStatus; result: CaseResult }[]
}

/** What is wrong with one version of the partner, once a run is over. */
export interface VersionInfo {
  name: string
  bug: string | null
  status: 'failed' | 'timed_out' | null
  catches: string[]
}

/** The answer to one `next`: the case just run, or that the lane is done. */
export interface NextAnswer {
  lane: Lane
  done: boolean
  position?: number
  total?: number
  result?: { caseId: string; status: CaseStatus; durationMs: number }
  restore?: Restore | null
}

/** Why a call failed, in words the page can choose its own message for. */
export type Failure =
  | 'no-session' // 401: no cookie, or it has expired
  | 'rate-limited' // 429 on starting a session
  | 'run-limit' // 429 on starting a run
  | 'not-configured' // 503: the deployment lacks a secret
  | 'already-shown' // 410: the signing secret was shown once already
  | 'member-busy' // 423: another run holds the member this lane needs
  | 'lane-busy' // 409: another request is already running this lane
  | 'not-found' // 404
  | 'unavailable' // 502 and other 5xx
  | 'network' // the request never got an answer
  | 'unexpected'

export class ApiError extends Error {
  constructor(
    readonly failure: Failure,
    readonly status: number,
    /** Seconds to wait, from `Retry-After`, when the server said. */
    readonly retryAfter?: number,
  ) {
    super(`${failure} (${status})`)
  }
}

function failureFor(status: number): Failure {
  if (status === 401) return 'no-session'
  if (status === 404) return 'not-found'
  if (status === 409) return 'lane-busy'
  if (status === 410) return 'already-shown'
  if (status === 423) return 'member-busy'
  if (status === 429) return 'rate-limited'
  if (status === 503) return 'not-configured'
  if (status >= 500) return 'unavailable'
  return 'unexpected'
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export function createClient(fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(`/api${path}`, { credentials: 'same-origin', ...init })
    } catch {
      throw new ApiError('network', 0)
    }
    if (!response.ok) {
      const wait = Number(response.headers.get('retry-after'))
      throw new ApiError(
        failureFor(response.status),
        response.status,
        Number.isFinite(wait) && wait > 0 ? wait : undefined,
      )
    }
    try {
      return (await response.json()) as T
    } catch {
      // A 200 that is not JSON is not an answer from this API: a proxy's page,
      // or a route that fell through to the page's own HTML.
      throw new ApiError('unexpected', response.status)
    }
  }

  return {
    /** Starts a session: the server provisions a partner and sets the cookie. */
    startSession: () => call<SessionView>('/sessions', { method: 'POST' }),

    /** The current session with the members' balances, or null if there is none. */
    async getSession(): Promise<SessionView | null> {
      try {
        return await call<SessionView>('/session')
      } catch (error) {
        if (error instanceof ApiError && error.failure === 'no-session') return null
        throw error
      }
    },

    /** What each case is about, in the order the server lists them. */
    listCases: () => call<CaseInfo[]>('/cases'),

    /** What was wrong with each version, for the result page to say. */
    listVersions: () => call<VersionInfo[]>('/versions'),

    /** Starts a run. The page names a version and services; the server plans the cases. */
    async createRun(version: string, services: string[]): Promise<RunView> {
      try {
        return await call<RunView>('/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version, services }),
        })
      } catch (error) {
        // A run limit is not the same thing as a session limit, and says so.
        if (error instanceof ApiError && error.failure === 'rate-limited') {
          throw new ApiError('run-limit', error.status, error.retryAfter)
        }
        throw error
      }
    },

    getRun: (id: string) => call<RunView>(`/runs/${encodeURIComponent(id)}`),

    /** Runs the lane's next case — or, when its cases are done, gives the member's points back. */
    next: (runId: string, lane: Lane) =>
      call<NextAnswer>(`/runs/${encodeURIComponent(runId)}/lanes/${lane}/next`, {
        method: 'POST',
      }),

    /** The signing secret. The server shows it once; a second ask is `already-shown`. */
    async revealSecret(): Promise<string> {
      const { secret } = await call<{ secret: string }>('/session/secret', { method: 'POST' })
      return secret
    },
  }
}

export type Client = ReturnType<typeof createClient>
