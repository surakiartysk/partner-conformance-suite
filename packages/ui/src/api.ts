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

/** Why a call failed, in words the page can choose its own message for. */
export type Failure =
  | 'no-session' // 401: no cookie, or it has expired
  | 'rate-limited' // 429
  | 'not-configured' // 503: the deployment lacks a secret
  | 'already-shown' // 410: the signing secret was shown once already
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
  if (status === 410) return 'already-shown'
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

    /** The signing secret. The server shows it once; a second ask is `already-shown`. */
    async revealSecret(): Promise<string> {
      const { secret } = await call<{ secret: string }>('/session/secret', { method: 'POST' })
      return secret
    },
  }
}

export type Client = ReturnType<typeof createClient>
