// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import { session } from './fixtures'

/**
 * The glue: what the page does with a session, a route and the browser's history. The pieces
 * are tested one by one elsewhere; this is where they are put together.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let started = false
const calls: string[] = []
/** Answers that replace the usual ones, by "METHOD path", for the test that sets them. */
let answers: Record<string, () => Response | Promise<Response>> = {}

beforeEach(() => {
  started = false
  calls.length = 0
  answers = {}
  window.history.replaceState(null, '', '/')
  document.title = ''
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input}`
    calls.push(key)
    if (answers[key]) return answers[key]()
    if (key === 'GET /api/session') return started ? json(session()) : json({}, 401)
    if (key === 'POST /api/sessions') {
      started = true
      return json(session(), 201)
    }
    if (key === 'GET /api/cases')
      return json([
        {
          id: 'earn/adds-points',
          service: 'earn',
          name: 'Earning adds',
          description: '',
          member: 'A',
          writes: true,
        },
      ])
    return json({}, 404)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the page as a whole', () => {
  it('asks for a session first, and shows the way in when there is none', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Try it' })).toBeTruthy()
    expect(calls[0]).toBe('GET /api/session')
    expect(document.title).toBe('Partner conformance suite')
  })

  it('starts a session, goes to the connection, and says so in the title and the focus', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Try it' }))
    const heading = await screen.findByRole('heading', { name: 'Connection' })
    expect(window.location.pathname).toBe('/connection')
    expect(document.title).toBe('Connection · Partner conformance suite')
    expect(document.activeElement).toBe(heading)
  })

  it('reads the session again after starting it, since starting does not report balances', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Try it' }))
    await screen.findByRole('heading', { name: 'Connection' })
    expect(calls.filter((c) => c === 'GET /api/session')).toHaveLength(2)
    expect(calls.indexOf('POST /api/sessions')).toBeLessThan(calls.lastIndexOf('GET /api/session'))
  })

  it('goes on from the connection to the Run page, which loads the cases', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Try it' }))
    await user.click(await screen.findByRole('button', { name: 'Continue to Run' }))
    expect(await screen.findByRole('heading', { name: 'Run' })).toBeTruthy()
    await screen.findByRole('button', { name: 'Run 1 case' })
    expect(window.location.pathname).toBe('/run')
    expect(document.title).toBe('Run · Partner conformance suite')
    expect(calls).toContain('GET /api/cases')
  })

  it('says there is no session, rather than a blank page, on a page that needs one', async () => {
    window.history.replaceState(null, '', '/run')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Run' })).toBeTruthy()
    expect(screen.getByText('There is no session, or it has ended. Start a new one.')).toBeTruthy()
    expect(calls).not.toContain('GET /api/cases')
  })

  it('follows the browser back, to the page it came from', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Try it' }))
    await screen.findByRole('heading', { name: 'Connection' })
    window.history.replaceState(null, '', '/history')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(document.title).toBe('History · Partner conformance suite'))
  })

  it('names a page that does not exist', async () => {
    window.history.replaceState(null, '', '/nothing-here')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeTruthy()
    expect(document.title).toBe('Not found · Partner conformance suite')
  })
})

/**
 * What App does on the way: the secret, the balances read again, a start that fails, the wait for
 * the first answer, and the clock. Each is a branch of App's own, not of a component it renders.
 */
describe('the page between its answers', () => {
  /** The secret itself, not the section named after it. */
  const shownSecret = () => document.querySelector('p[aria-label="Signing secret"]')
  const startedAt = async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Try it' }))
    await screen.findByRole('heading', { name: 'Connection' })
    return user
  }

  it('shows the signing secret when asked, once', async () => {
    answers['POST /api/session/secret'] = () => json({ secret: 'whsec_test' })
    const user = await startedAt()
    await user.click(screen.getByRole('button', { name: 'Show the secret once' }))
    await waitFor(() => expect(shownSecret()?.textContent).toBe('whsec_test'))
    expect(screen.queryByRole('button', { name: 'Show the secret once' })).toBeNull()
    expect(calls.filter((c) => c === 'POST /api/session/secret')).toHaveLength(1)
  })

  it('says why the secret could not be shown, in its own words', async () => {
    answers['POST /api/session/secret'] = () => json({ detail: 'server words' }, 410)
    const user = await startedAt()
    await user.click(screen.getByRole('button', { name: 'Show the secret once' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The signing secret has already been shown once. Start a new session to see another.',
    )
    expect(shownSecret()).toBeNull()
  })

  it('forgets a secret shown for the old session when a new one starts', async () => {
    answers['POST /api/session/secret'] = () => json({ secret: 'whsec_old' })
    const user = await startedAt()
    await user.click(screen.getByRole('button', { name: 'Show the secret once' }))
    await waitFor(() => expect(shownSecret()).not.toBeNull())
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Home' }))
    await user.click(await screen.findByRole('button', { name: 'Start a new session instead' }))
    await screen.findByRole('heading', { name: 'Connection' })
    expect(shownSecret()).toBeNull()
    expect(screen.getByRole('button', { name: 'Show the secret once' })).toBeTruthy()
  })

  it('reads the balances again, and says so when the session has ended meanwhile', async () => {
    const user = await startedAt()
    answers['GET /api/session'] = () =>
      json(
        session({
          members: [
            { slot: 'A', id: 'mbr_a', balance: 900 },
            { slot: 'B', id: 'mbr_b', balance: 1100 },
          ],
        }),
      )
    await user.click(screen.getByRole('button', { name: 'Read the balances again' }))
    expect(await screen.findByText('900')).toBeTruthy()

    answers['GET /api/session'] = () => json({}, 401)
    await user.click(screen.getByRole('button', { name: 'Read the balances again' }))
    expect(
      await screen.findByText('There is no session, or it has ended. Start a new one.'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connection' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read the balances again' })).toBeNull()
  })

  it('says why a session could not be started, and stays where it is', async () => {
    answers['POST /api/sessions'] = () =>
      new Response('{}', { status: 429, headers: { 'retry-after': '120' } })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Try it' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many sessions have been started from this address. Try again in 2 min.',
    )
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('button', { name: 'Try it' })).toHaveProperty('disabled', false)
  })

  it('says it is loading until the server has said whether there is a session', async () => {
    let answer: (response: Response) => void = () => {}
    answers['GET /api/session'] = () => new Promise((resolve) => (answer = resolve))
    render(<App />)
    expect(await screen.findByText('Loading…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try it' })).toBeNull()
    answer(json({}, 401))
    expect(await screen.findByRole('button', { name: 'Try it' })).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('counts the session down while the page stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(Date.parse('2026-10-08T12:00:00.000Z') - 61 * 60_000)
    started = true
    render(<App />)
    expect(await screen.findByText('Your session ends in 1 h 1 min.')).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('Your session ends in 1 h 0 min.')).toBeTruthy()
  })
})
