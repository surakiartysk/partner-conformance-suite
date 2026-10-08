// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type CaseInfo, type Client, type NextAnswer, type RunView } from '../src/api'
import { RunPage } from '../src/components/RunPage'
import type { Route } from '../src/route'
import { session } from './fixtures'

afterEach(cleanup)

const caseInfo = (id: string, service: string, name: string): CaseInfo => ({
  id,
  service,
  name,
  description: '',
  member: 'A',
  writes: id.startsWith('earn'),
})
const CASES = [
  caseInfo('security/valid-signature', 'security', 'A correctly signed request is accepted'),
  caseInfo('earn/adds-points', 'earn', 'Earning adds exactly the points earned'),
  caseInfo('earn/duplicate-reference', 'earn', 'Earning twice adds the points once'),
]

function runView(services: string[], version: string): RunView {
  const chosen = CASES.filter((c) => services.includes(c.service))
  const read = chosen.filter((c) => !c.writes).map((c) => c.id)
  const a = chosen.filter((c) => c.writes).map((c) => c.id)
  return {
    id: 'run_1',
    version,
    services,
    createdAt: '',
    finishedAt: null,
    lanes: [
      ...(read.length
        ? [{ lane: 'read' as const, cases: read, position: 0, done: false, restore: null }]
        : []),
      ...(a.length
        ? [{ lane: 'A' as const, cases: a, position: 0, done: false, restore: null }]
        : []),
    ],
    results: [],
  }
}

/** A client whose lanes answer from a script, and which remembers how it was called. */
function fakeClient(
  options: {
    failCreate?: ApiError
    failing?: string[]
    hold?: boolean
  } = {},
) {
  const created: { version: string; services: string[] }[] = []
  const asked: string[] = []
  const queues = new Map<string, string[]>()
  const waiters: (() => void)[] = []
  const client = {
    listCases: async () => CASES,
    createRun: async (version: string, services: string[]) => {
      created.push({ version, services })
      if (options.failCreate) throw options.failCreate
      const run = runView(services, version)
      for (const lane of run.lanes) queues.set(lane.lane, [...lane.cases])
      return run
    },
    next: async (_: string, lane: 'read' | 'A' | 'B'): Promise<NextAnswer> => {
      asked.push(lane)
      if (options.hold) await new Promise<void>((r) => waiters.push(r))
      const queue = queues.get(lane)!
      const caseId = queue.shift()
      if (caseId === undefined) {
        return {
          lane,
          done: true,
          restore: lane === 'read' ? null : { status: 'restored', target: 1000 },
        }
      }
      const status = options.failing?.includes(caseId) ? 'failed' : 'passed'
      return { lane, done: false, result: { caseId, status, durationMs: 5 } }
    },
    getRun: async () => runView([], 'x'),
  } as unknown as Client
  return {
    client,
    created,
    asked, // Lets every request that is being held through.
    release: () => waiters.splice(0).forEach((r) => r()),
  }
}

const renderPage = (
  client: Client,
  versions = ['correct', 'double-earn', 'off-by-one'],
  onNavigate: (to: Route) => void = () => {},
) =>
  render(
    <RunPage
      client={client}
      session={session({ partner: { tenant: 't', versions, baseUrls: {} } })}
      onNavigate={onNavigate}
    />,
  )

describe('the Run page', () => {
  it('waits for the cases, then offers the form with a wrong version chosen', async () => {
    const { client } = fakeClient()
    renderPage(client)
    expect(screen.getByText('Loading…')).toBeTruthy()
    const chosen = await screen.findByRole('radio', { name: /double-earn/ })
    expect((chosen as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Run 3 cases' })).toBeTruthy()
  })

  it('says why the cases could not be loaded, in place of the form', async () => {
    const client = {
      listCases: async () => {
        throw new ApiError('network', 0)
      },
    } as unknown as Client
    renderPage(client)
    expect((await screen.findByRole('alert')).textContent).toContain('could not be reached')
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('starts a run with the chosen version and services, and shows each lane to the end', async () => {
    const user = userEvent.setup()
    const { client, created } = fakeClient({ failing: ['earn/duplicate-reference'] })
    renderPage(client)
    await user.click(await screen.findByRole('radio', { name: /off-by-one/ }))
    await user.click(screen.getByRole('checkbox', { name: 'security' })) // off
    await user.click(screen.getByRole('button', { name: 'Run 2 cases' }))

    await waitFor(() => expect(screen.getByText('1 of 2 cases did not pass')).toBeTruthy())
    expect(created).toEqual([{ version: 'off-by-one', services: ['earn'] }])
    expect(screen.getByText('✕ 1 failed')).toBeTruthy()
    expect(
      screen.getByText('Points given back. Both members are at their starting balances.'),
    ).toBeTruthy()
  })

  it('locks the form while the run goes, and frees it when it is over', async () => {
    const user = userEvent.setup()
    const { client, release } = fakeClient({ hold: true })
    renderPage(client)
    await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Running…' })).toBeTruthy())
    expect((screen.getByRole('radio', { name: /correct/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Running…' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    // Let every lane through, then the page settles.
    for (let i = 0; i < 12; i++) {
      release()
      await new Promise((r) => setTimeout(r, 0))
    }
    await waitFor(() => expect(screen.getByText('All 3 cases passed')).toBeTruthy())
    expect((screen.getByRole('radio', { name: /correct/ }) as HTMLInputElement).disabled).toBe(
      false,
    )
  })

  it('shows why a run could not be started, keeps the form, and starts nothing', async () => {
    const user = userEvent.setup()
    const { client, asked } = fakeClient({ failCreate: new ApiError('run-limit', 429, 600) })
    renderPage(client)
    await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('started too many runs')
    expect(alert.textContent).toContain('10 min')
    expect(asked).toEqual([])
    expect(
      (screen.getByRole('button', { name: 'Run 3 cases' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('cannot start with no service chosen', async () => {
    const user = userEvent.setup()
    const { client, created } = fakeClient()
    renderPage(client)
    for (const name of ['security', 'earn']) {
      await user.click(await screen.findByRole('checkbox', { name }))
    }
    expect(screen.getByText('Choose at least one service.')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Run 0 cases' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await user.click(button)
    expect(created).toEqual([])
  })

  it('runs again from the summary, with the same choices', async () => {
    const user = userEvent.setup()
    const { client, created } = fakeClient()
    renderPage(client)
    await user.click(await screen.findByRole('radio', { name: /correct/ }))
    await user.click(screen.getByRole('button', { name: 'Run 3 cases' }))
    await user.click(await screen.findByRole('button', { name: 'Run again' }))
    // The summary is gone and the form is as it was left.
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()
    expect(screen.queryByText('All 3 cases passed')).toBeNull()
    expect((screen.getByRole('radio', { name: /correct/ }) as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Run 3 cases' }))
    await waitFor(() => expect(created).toHaveLength(2))
    expect(created[1]).toEqual(created[0])
  })

  it('stops asking the server when the visitor leaves the page', async () => {
    const user = userEvent.setup()
    const spy = fakeClient({ hold: true })
    const { unmount } = renderPage(spy.client)
    await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
    await waitFor(() => expect(spy.asked.length).toBeGreaterThan(0))
    const before = spy.asked.length
    unmount()
    for (let i = 0; i < 6; i++) {
      spy.release()
      await new Promise((r) => setTimeout(r, 0))
    }
    expect(spy.asked.length).toBe(before) // the answers in flight are dropped, and nothing is asked again
  })

  it('opens the result of the run that was just made, and of a case that did not pass', async () => {
    const user = userEvent.setup()
    const { client } = fakeClient({ failing: ['earn/duplicate-reference'] })
    const went: Route[] = []
    renderPage(client, undefined, (to) => went.push(to))
    await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
    await user.click(await screen.findByRole('button', { name: 'Open the result' }))
    await user.click(screen.getByRole('link', { name: 'Earning twice adds the points once' }))
    expect(went).toEqual([
      { page: 'result', runId: 'run_1' },
      { page: 'result', runId: 'run_1', caseId: 'earn/duplicate-reference' },
    ])
  })

  it('names each case in its lane, with its id', async () => {
    const user = userEvent.setup()
    const { client } = fakeClient({ hold: true })
    renderPage(client)
    await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
    const lane = await screen.findByText('Member A')
    const card = lane.closest('.lane') as HTMLElement
    expect(within(card).getByText('Earning adds exactly the points earned')).toBeTruthy()
    expect(within(card).getByText('earn/adds-points')).toBeTruthy()
  })
})

vi.setConfig({ testTimeout: 15_000 })
