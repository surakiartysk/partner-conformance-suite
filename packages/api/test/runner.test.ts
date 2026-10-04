import { defineCase, type CaseDefinition } from '@conformance/cases'
import { describe, expect, it } from 'vitest'
import { BODY_LIMIT_BYTES, HIDDEN, executeCase, type Target } from '../src/runner/execute'
import { sign } from '../src/runner/signing'

/**
 * The runner on its own, against partners scripted in each test. What it
 * sends, what it keeps, and how it reaches a verdict.
 */

const TARGET: Target = {
  baseUrl: 'https://partner.example/base/',
  secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  members: { A: 'mbr_a', B: 'mbr_b' },
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

/** A partner that answers from a script and remembers what it was sent. */
function scripted(answer: (request: Request) => Response | Promise<Response>) {
  const received: { request: Request; body: string }[] = []
  const transport = async (request: Request) => {
    received.push({ request, body: await request.clone().text() })
    return answer(request)
  }
  return { transport, received }
}

const readCase = (overrides: Partial<CaseDefinition> = {}): CaseDefinition =>
  defineCase({
    id: 'test/read',
    service: 'member',
    name: 'read',
    description: '',
    member: 'A',
    writes: false,
    act: {
      name: 'read',
      request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}` }),
      expect: (ctx) => ({ status: 200, body: { id: ctx.member.id } }),
    },
    ...overrides,
  })

describe('what the runner sends', () => {
  it('builds the URL from the target and signs the body exactly as sent', async () => {
    const { transport, received } = scripted(() => json({ ok: true }))
    const definition = readCase({
      act: {
        name: 'post',
        request: () => ({ method: 'POST', path: '/points/earn', body: { b: 1, a: [2] } }),
        expect: () => ({ status: 200 }),
      },
    })
    await executeCase(definition, TARGET, { transport })

    const [{ request, body }] = received as [(typeof received)[0]]
    expect(request.url).toBe('https://partner.example/base/points/earn')
    expect(body).toBe('{"b":1,"a":[2]}')
    const [id, timestamp] = [
      request.headers.get('webhook-id')!,
      request.headers.get('webhook-timestamp')!,
    ]
    expect(request.headers.get('webhook-signature')).toBe(
      await sign(TARGET.secret, id, timestamp, body),
    )
  })

  it('gives every request its own webhook-id', async () => {
    const { transport, received } = scripted(() => json({ balance: 5, memberId: 'mbr_a' }))
    const definition = readCase({
      writes: true,
      arrange: [{ name: 'one', request: () => ({ method: 'GET', path: '/x' }) }],
      verify: [
        {
          name: 'two',
          request: () => ({ method: 'GET', path: '/y' }),
          expect: () => ({ status: 200 }),
        },
      ],
      act: {
        name: 'three',
        request: () => ({ method: 'GET', path: '/z' }),
        expect: () => ({ status: 200 }),
      },
    })
    await executeCase(definition, TARGET, { transport })
    const ids = received.map(({ request }) => request.headers.get('webhook-id'))
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })

  it('replays an earlier request byte for byte', async () => {
    const { transport, received } = scripted(() => json({}))
    const definition = readCase({
      arrange: [
        { name: 'original', request: () => ({ method: 'POST', path: '/p', body: { n: 1 } }) },
      ],
      act: {
        name: 'copy',
        request: () => ({ replayOf: 'original' }),
        expect: () => ({ status: 200 }),
      },
    })
    await executeCase(definition, TARGET, { transport })
    const [first, second] = received as [(typeof received)[0], (typeof received)[0]]
    expect(second.body).toBe(first.body)
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      expect(second.request.headers.get(name)).toBe(first.request.headers.get(name))
    }
  })

  it('applies each signing fault, and only that fault', async () => {
    const { transport, received } = scripted(() => json({}))
    const send = (fault: object) =>
      executeCase(
        readCase({
          act: {
            name: 'faulty',
            request: () => ({ method: 'POST', path: '/p', body: { points: 10 }, fault }),
            expect: () => ({ status: 401 }),
          },
        }),
        TARGET,
        { transport, now: () => 1_700_000_000_000 },
      )

    await send({ omit: 'webhook-signature' })
    await send({ timestampOffset: -360 })
    await send({ tamper: (b: string) => b.replace('10', '900') })
    await send({ wrongSecret: true })
    const [omitted, stale, tampered, foreign] = received.map((r) => r) as [
      (typeof received)[0],
      (typeof received)[0],
      (typeof received)[0],
      (typeof received)[0],
    ]

    expect(omitted.request.headers.has('webhook-signature')).toBe(false)
    expect(omitted.request.headers.has('webhook-id')).toBe(true)

    expect(stale.request.headers.get('webhook-timestamp')).toBe(String(1_700_000_000 - 360))

    // Signed over the original, sent with the change.
    expect(tampered.body).toBe('{"points":900}')
    const h = (name: string) => tampered.request.headers.get(name)!
    expect(h('webhook-signature')).toBe(
      await sign(TARGET.secret, h('webhook-id'), h('webhook-timestamp'), '{"points":10}'),
    )

    const f = (name: string) => foreign.request.headers.get(name)!
    expect(f('webhook-signature')).not.toBe(
      await sign(TARGET.secret, f('webhook-id'), f('webhook-timestamp'), foreign.body),
    )
  })

  it('keeps one reference per label within a case', async () => {
    const { transport, received } = scripted(() => json({}))
    const definition = readCase({
      arrange: [
        {
          name: 'a',
          request: (ctx) => ({ method: 'POST', path: '/p', body: { r: ctx.ref('x') } }),
        },
        {
          name: 'b',
          request: (ctx) => ({ method: 'POST', path: '/p', body: { r: ctx.ref('x') } }),
        },
      ],
      act: {
        name: 'c',
        request: (ctx) => ({ method: 'POST', path: '/p', body: { r: ctx.ref('y') } }),
        expect: () => ({ status: 200 }),
      },
    })
    await executeCase(definition, TARGET, { transport })
    const refs = received.map(({ body }) => (JSON.parse(body) as { r: string }).r)
    expect(refs[0]).toBe(refs[1])
    expect(refs[2]).not.toBe(refs[0])
  })
})

describe('what the runner keeps', () => {
  it('shows allowlisted headers and hides the rest by value, not by name', async () => {
    const { transport } = scripted(() =>
      json({ id: 'mbr_a' }, 200, { 'x-session-token': 'secret-value', 'set-cookie': 'sid=abc' }),
    )
    const result = await executeCase(readCase(), TARGET, { transport })
    const headers = result.steps[0]!.response!.headers
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-session-token']).toBe(HIDDEN)
    expect(headers['set-cookie']).toBe(HIDDEN)
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it('keeps no more than the body limit, and says it cut it', async () => {
    const huge = 'x'.repeat(BODY_LIMIT_BYTES + 5000)
    const { transport } = scripted(() => new Response(huge, { status: 200 }))
    const result = await executeCase(readCase(), TARGET, { transport })
    const response = result.steps[0]!.response!
    expect(response.truncated).toBe(true)
    expect(response.body).toHaveLength(BODY_LIMIT_BYTES)
    expect(result.status).toBe('failed')
  })

  it('keeps a body that is not JSON as text, and fails the case', async () => {
    const { transport } = scripted(() => new Response('Not Found', { status: 200 }))
    const result = await executeCase(readCase(), TARGET, { transport })
    const step = result.steps[0]!
    expect(step.response).toMatchObject({ json: false, body: 'Not Found' })
    expect(step.mismatches).toEqual([{ path: '$', expected: 'an object', actual: 'Not Found' }])
    expect(result.status).toBe('failed')
  })
})

describe('the verdict', () => {
  it('passes when the act matches', async () => {
    const { transport } = scripted(() => json({ id: 'mbr_a', extra: 'allowed' }))
    expect((await executeCase(readCase(), TARGET, { transport })).status).toBe('passed')
  })

  it('fails on a wrong status, and says which', async () => {
    const { transport } = scripted(() => json({ id: 'mbr_a' }, 201))
    const result = await executeCase(readCase(), TARGET, { transport })
    expect(result.status).toBe('failed')
    expect(result.steps[0]!.mismatches).toEqual([{ path: 'status', expected: '200', actual: 201 }])
  })

  it('reports a header the expectation names but the response lacks as missing', async () => {
    // Bytes rather than a string, which would get a text/plain content-type for free.
    const { transport } = scripted(
      () => new Response(new TextEncoder().encode('{}'), { status: 404 }),
    )
    const definition = readCase({
      act: {
        name: 'read',
        request: () => ({ method: 'GET', path: '/x' }),
        expect: () => ({ status: 404, headers: { 'Content-Type': 'application/problem+json' } }),
      },
    })
    const result = await executeCase(definition, TARGET, { transport })
    expect(result.steps[0]!.mismatches).toEqual([
      { path: 'header content-type', expected: '"application/problem+json"', missing: true },
    ])
  })

  it('is timed_out, not failed, when the partner does not answer in time', async () => {
    // Ignores the abort signal entirely, so only the race can end the wait.
    const transport = () => new Promise<Response>(() => {})
    const began = Date.now()
    const result = await executeCase(readCase(), TARGET, { transport, timeoutMs: 50 })
    expect(result.status).toBe('timed_out')
    expect(result.steps[0]!.outcome).toBe('timed_out')
    expect(Date.now() - began).toBeLessThan(2000)
  })

  it('is an error, and does not act, when an arrange step fails', async () => {
    const { transport, received } = scripted((request) =>
      new URL(request.url).pathname.endsWith('/setup') ? json({}, 500) : json({ id: 'mbr_a' }),
    )
    const definition = readCase({
      arrange: [{ name: 'setup', request: () => ({ method: 'POST', path: '/setup', body: {} }) }],
    })
    const result = await executeCase(definition, TARGET, { transport })
    expect(result.status).toBe('error')
    expect(received).toHaveLength(1)
    expect(result.steps[0]!.mismatches).toEqual([
      { path: 'status', expected: 'any 2xx', actual: 500 },
    ])
  })

  it('is timed_out, not an error, when the partner is slow on the starting balance', async () => {
    const transport = () => new Promise<Response>(() => {})
    const result = await executeCase(readCase({ writes: true }), TARGET, {
      transport,
      timeoutMs: 50,
    })
    expect(result.status).toBe('timed_out')
    expect(result.steps.map((s) => [s.phase, s.outcome])).toEqual([['start', 'timed_out']])
  })

  it('is timed_out, not an error, when the partner is slow on an arrange step', async () => {
    const { transport, received } = scripted((request) =>
      new URL(request.url).pathname.endsWith('/setup')
        ? new Promise<Response>(() => {})
        : json({ id: 'mbr_a' }),
    )
    const definition = readCase({
      arrange: [{ name: 'setup', request: () => ({ method: 'POST', path: '/setup', body: {} }) }],
    })
    const result = await executeCase(definition, TARGET, { transport, timeoutMs: 50 })
    expect(result.status).toBe('timed_out')
    expect(received).toHaveLength(1)
  })

  it('is an error when the starting balance of a writing case cannot be read', async () => {
    const { transport, received } = scripted(() => json({ balance: 'lots' }))
    const result = await executeCase(readCase({ writes: true }), TARGET, { transport })
    expect(result.status).toBe('error')
    expect(received).toHaveLength(1)
  })

  it('judges verify steps too: a right answer with a wrong balance afterwards fails', async () => {
    let balance = 1000
    const { transport } = scripted((request) => {
      if (request.method === 'POST') balance += 1 // the partner moves the balance anyway
      return json({ memberId: 'mbr_a', balance, id: 'mbr_a' })
    })
    const definition = readCase({
      writes: true,
      act: {
        name: 'refused earn',
        request: () => ({ method: 'POST', path: '/points/earn', body: {} }),
        expect: () => ({ status: 200 }),
      },
      verify: [
        {
          name: 'balance',
          request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}/balance` }),
          expect: (ctx) => ({ status: 200, body: { balance: ctx.start.unchanged() } }),
        },
      ],
    })
    const result = await executeCase(definition, TARGET, { transport })
    expect(result.status).toBe('failed')
    expect(result.steps.at(-1)!.mismatches).toEqual([
      { path: '$.balance', expected: 'balance at start, unchanged = 1,000', actual: 1001 },
    ])
  })
})
