// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

beforeEach(() => {
  started = false
  calls.length = 0
  window.history.replaceState(null, '', '/')
  document.title = ''
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input}`
    calls.push(key)
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
