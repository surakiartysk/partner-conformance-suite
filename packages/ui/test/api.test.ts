import { describe, expect, it } from 'vitest'
import { ApiError, createClient } from '../src/api'

type Call = { url: string; init: RequestInit | undefined }

/** A fetch that answers with what it is told and remembers what it was asked. */
function fake(answer: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return answer()
  }
  return { client: createClient(fetchImpl), calls }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected the call to fail')
}

describe('the API client', () => {
  it('starts a session with a bare POST: nothing about where the partner is', async () => {
    const { client, calls } = fake(() => json({ expiresAt: 'x' }, { status: 201 }))
    await client.startSession()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/api/sessions')
    expect(calls[0]!.init?.method).toBe('POST')
    // The server decides the partner (decision 1.1); the page has no way to say.
    expect(calls[0]!.init?.body).toBeUndefined()
    expect(calls[0]!.init?.credentials).toBe('same-origin')
  })

  it('reads the session from /api/session', async () => {
    const { client, calls } = fake(() => json({ members: [] }))
    expect(await client.getSession()).toEqual({ members: [] })
    expect(calls[0]!.url).toBe('/api/session')
  })

  it('answers null, not an error, when there is no session', async () => {
    const { client } = fake(() => json({ error: 'no session' }, { status: 401 }))
    expect(await client.getSession()).toBeNull()
  })

  it('still fails on a server error when reading the session', async () => {
    const { client } = fake(() => json({}, { status: 500 }))
    expect((await failure(client.getSession())).failure).toBe('unavailable')
  })

  it('returns the secret, and asks with a POST', async () => {
    const { client, calls } = fake(() => json({ secret: 'whsec_abc' }))
    expect(await client.revealSecret()).toBe('whsec_abc')
    expect(calls[0]!.url).toBe('/api/session/secret')
    expect(calls[0]!.init?.method).toBe('POST')
  })

  it('tells a second showing from other failures', async () => {
    const { client } = fake(() => json({ error: 'shown' }, { status: 410 }))
    expect((await failure(client.revealSecret())).failure).toBe('already-shown')
  })

  it('reads how long to wait from Retry-After', async () => {
    const { client } = fake(() => json({}, { status: 429, headers: { 'retry-after': '3600' } }))
    const error = await failure(client.startSession())
    expect([error.failure, error.retryAfter]).toEqual(['rate-limited', 3600])
  })

  it('does not invent a wait the server did not give', async () => {
    const { client } = fake(() => json({}, { status: 429 }))
    expect((await failure(client.startSession())).retryAfter).toBeUndefined()
  })

  it.each([
    [503, 'not-configured'],
    [502, 'unavailable'],
    [500, 'unavailable'],
    [400, 'unexpected'],
    [418, 'unexpected'],
    [404, 'not-found'],
    [409, 'lane-busy'],
    [423, 'member-busy'],
  ])('maps %i to %s', async (status, expected) => {
    const { client } = fake(() => json({}, { status }))
    expect((await failure(client.startSession())).failure).toBe(expected)
  })

  it('reports a request that never got an answer', async () => {
    const client = createClient(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect((await failure(client.startSession())).failure).toBe('network')
  })

  /**
   * In development a route missing from the proxy falls through to the page,
   * and the fetch gets index.html with a 200.
   */
  it('refuses a 200 that is not JSON rather than treating it as an answer', async () => {
    const { client } = fake(() => new Response('<!doctype html>', { status: 200 }))
    expect((await failure(client.startSession())).failure).toBe('unexpected')
  })
})

describe('the API client, for runs', () => {
  const answer = { id: 'run_1', lanes: [] }

  it('lists the cases from /api/cases', async () => {
    const { client, calls } = fake(() => json([{ id: 'earn/adds-points' }]))
    expect(await client.listCases()).toEqual([{ id: 'earn/adds-points' }])
    expect(calls[0]!.url).toBe('/api/cases')
  })

  it('starts a run by naming a version and services, and nothing else', async () => {
    const { client, calls } = fake(() => json(answer, { status: 201 }))
    await client.createRun('double-earn', ['earn', 'redeem'])
    expect(calls[0]!.url).toBe('/api/runs')
    expect(calls[0]!.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      version: 'double-earn',
      services: ['earn', 'redeem'],
    })
    expect(new Headers(calls[0]!.init?.headers).get('content-type')).toBe('application/json')
  })

  it('says a run limit, not a session limit, when too many runs were started', async () => {
    const { client } = fake(() => json({}, { status: 429, headers: { 'retry-after': '600' } }))
    const error = await failure(client.createRun('correct', ['earn']))
    expect([error.failure, error.retryAfter]).toEqual(['run-limit', 600])
  })

  it('reads a run by its id, and the id cannot change the path', async () => {
    const { client, calls } = fake(() => json(answer))
    await client.getRun('run_1')
    await client.getRun('../session')
    expect(calls[0]!.url).toBe('/api/runs/run_1')
    expect(calls[1]!.url).toBe('/api/runs/..%2Fsession')
  })

  it('asks for the next case of a lane with a bare POST', async () => {
    const { client, calls } = fake(() => json({ lane: 'A', done: false }))
    await client.next('run_1', 'A')
    expect(calls[0]!.url).toBe('/api/runs/run_1/lanes/A/next')
    expect(calls[0]!.init?.method).toBe('POST')
    // Which case, what is sent and where are the server's; there is nothing to send.
    expect(calls[0]!.init?.body).toBeUndefined()
  })
})
