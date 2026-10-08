// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError, type Client, type RunListItem } from '../src/api'
import { History } from '../src/components/History'
import { HistoryPage } from '../src/components/HistoryPage'
import type { Route } from '../src/route'

afterEach(cleanup)

const NOW = Date.parse('2026-10-08T12:00:00Z')
const run = (over: Partial<RunListItem> = {}): RunListItem => ({
  id: 'run_1',
  version: 'double-earn',
  services: ['earn'],
  createdAt: new Date(NOW - 5 * 60_000).toISOString(),
  finishedAt: new Date(NOW - 4 * 60_000).toISOString(),
  total: 4,
  counts: { passed: 3, failed: 1, timedOut: 0, error: 0 },
  ...over,
})

const html = (runs: RunListItem[]) =>
  renderToStaticMarkup(<History runs={runs} now={NOW} onNavigate={() => {}} />)

describe('the history', () => {
  it('lists each run with its version, how long ago it was, its services and its size', () => {
    const out = html([run()])
    expect(out).toContain('double-earn')
    expect(out).toContain('5 min ago')
    expect(out).toContain('earn · 4 cases')
  })

  it('links each run to its result', () => {
    const out = html([run({ id: 'run_a' }), run({ id: 'run_b' })])
    expect(out).toContain('href="/runs/run_a"')
    expect(out).toContain('href="/runs/run_b"')
  })

  it('keeps the order it was given, which is newest first', () => {
    const out = html([run({ id: 'run_new', version: 'overdraws' }), run({ id: 'run_old' })])
    expect(out.indexOf('overdraws')).toBeLessThan(out.indexOf('double-earn'))
  })

  it('names what did not pass, each kind apart', () => {
    const out = html([run({ counts: { passed: 10, failed: 2, timedOut: 3, error: 1 }, total: 16 })])
    expect(out).toContain('✓ 10 passed')
    expect(out).toContain('✕ 2 failed')
    expect(out).toContain('! 3 timed out')
    expect(out).toContain('! 1 error')
    // Each looks like what it is: a timeout is not drawn as a failure.
    expect(out).toContain('<span class="st fail">✕ 2 failed</span>')
    expect(out).toContain('<span class="st warn">! 3 timed out</span>')
    expect(out).toContain('<span class="st err">! 1 error</span>')
  })

  it('says everything passed when it did, in one chip', () => {
    const out = html([run({ counts: { passed: 4, failed: 0, timedOut: 0, error: 0 } })])
    expect(out).toContain('✓ All 4 passed')
    expect(out).not.toContain('failed')
  })

  it('says a run that is not over has not finished, and how far it got, and never calls it a pass', () => {
    const out = html([
      run({ finishedAt: null, counts: { passed: 2, failed: 0, timedOut: 0, error: 0 } }),
    ])
    expect(out).toContain('Not finished · 2 of 4')
    expect(out).not.toContain('All 4 passed')
  })

  it('does not call a run with nothing planned a pass', () => {
    const out = html([run({ total: 0, counts: { passed: 0, failed: 0, timedOut: 0, error: 0 } })])
    expect(out).not.toContain('All 0 passed')
  })

  it('says case, not cases, for one', () => {
    expect(html([run({ total: 1 })])).toContain('earn · 1 case<')
  })

  it('invites a run when there are none, and lists nothing', () => {
    const out = html([])
    expect(out).toContain('No runs yet')
    expect(out).toContain('>Go to Run</button>')
    expect(out).not.toContain('<ul')
  })

  it('shows what a run carries as text, never as markup', () => {
    const out = html([run({ version: '<img src=x onerror=alert(1)>', services: ['<b>x</b>'] })])
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;img')
  })
})

describe('the History page', () => {
  const show = (
    listRuns: () => Promise<RunListItem[]>,
    onNavigate: (to: Route) => void = () => {},
  ) =>
    render(
      <HistoryPage client={{ listRuns } as unknown as Client} now={NOW} onNavigate={onNavigate} />,
    )

  it('waits for the runs, then lists them', async () => {
    show(async () => [run({ id: 'run_a' }), run({ id: 'run_b', version: 'overdraws' })])
    expect(screen.getByText('Loading…')).toBeTruthy()
    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('link')).toHaveLength(2)
  })

  it('says why the runs could not be listed, and lists none', async () => {
    show(async () => {
      throw new ApiError('no-session', 401)
    })
    expect((await screen.findByRole('alert')).textContent).toContain('no session')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows the empty state for a session with no runs', async () => {
    show(async () => [])
    await screen.findByText('No runs yet')
  })

  it('opens a run in the page when its link is followed, and leaves a modified click alone', async () => {
    const user = userEvent.setup()
    const went: Route[] = []
    show(
      async () => [run({ id: 'run_a' })],
      (to) => went.push(to),
    )
    const link = await screen.findByRole('link')
    await user.click(link)
    await user.keyboard('{Control>}')
    await user.click(link)
    await user.keyboard('{/Control}')
    expect(went).toEqual([{ page: 'result', runId: 'run_a' }])
  })

  it('goes to Run from the empty state', async () => {
    const user = userEvent.setup()
    const went: Route[] = []
    show(
      async () => [],
      (to) => went.push(to),
    )
    await user.click(await screen.findByRole('button', { name: 'Go to Run' }))
    expect(went).toEqual([{ page: 'run' }])
  })
})
