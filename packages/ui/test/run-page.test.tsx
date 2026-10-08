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

function runView(ids: string[], version: string): RunView {
  const chosen = CASES.filter((c) => ids.includes(c.id))
  const services = [...new Set(chosen.map((c) => c.service))]
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
  const created: { version: string; cases: string[] }[] = []
  const asked: string[] = []
  const queues = new Map<string, string[]>()
  const waiters: (() => void)[] = []
  const client = {
    listCases: async () => CASES,
    createRun: async (version: string, cases: string[]) => {
      created.push({ version, cases })
      if (options.failCreate) throw options.failCreate
      const run = runView(cases, version)
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

  it('starts a run with the chosen version and cases, and shows each lane to the end', async () => {
    const user = userEvent.setup()
    const { client, created } = fakeClient({ failing: ['earn/duplicate-reference'] })
    renderPage(client)
    await user.click(await screen.findByRole('radio', { name: /off-by-one/ }))
    await user.click(screen.getByRole('checkbox', { name: /^security/ })) // the whole group, off
    await user.click(screen.getByRole('button', { name: 'Run 2 cases' }))

    await waitFor(() => expect(screen.getByText('1 of 2 cases did not pass')).toBeTruthy())
    expect(created).toEqual([
      { version: 'off-by-one', cases: ['earn/adds-points', 'earn/duplicate-reference'] },
    ])
    expect(screen.getByText('✕ 1 failed')).toBeTruthy()
    expect(
      screen.getByText('Points given back. Both members are at their starting balances.'),
    ).toBeTruthy()
  })

  describe('saying how a run is going', () => {
    const status = () => document.querySelector('.sr-only[role="status"]') as HTMLElement

    it('has a place for it from the start, with nothing in it', async () => {
      const { client } = fakeClient()
      renderPage(client)
      await screen.findByRole('button', { name: 'Run 3 cases' })
      expect(status()).toBeTruthy()
      expect(status().textContent).toBe('')
    })

    it('says once that a run has begun, and what it is of, and not every case after', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient({ hold: true })
      renderPage(client)
      await user.click(await screen.findByRole('radio', { name: /off-by-one/ }))
      await user.click(screen.getByRole('button', { name: 'Run 3 cases' }))
      await waitFor(() => expect(status().textContent).toBe('Running 3 cases against off-by-one'))
      // the visible count is not what is announced
      expect(screen.getByText(/of 3 done/).closest('[role="status"]')).toBeNull()
    })

    it('says how it ended, the verdict and whether the points are back', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient({ failing: ['earn/duplicate-reference'] })
      renderPage(client)
      await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
      await waitFor(() =>
        expect(status().textContent).toBe(
          '1 of 3 cases did not pass. Points given back. Both members are at their starting balances.',
        ),
      )
    })

    it('says an all-pass run passed, and goes quiet again when the form is back', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient()
      renderPage(client)
      await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
      await waitFor(() => expect(status().textContent).toMatch(/^All 3 cases passed\./))
      await user.click(await screen.findByRole('button', { name: 'Run again' }))
      expect(status().textContent).toBe('')
    })
  })

  describe('while a run goes', () => {
    it('keeps the version card and the run bar, and shows the lanes in place of the cases', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient({ hold: true })
      renderPage(client)
      await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Running…' })).toBeTruthy())
      expect(screen.getByRole('heading', { name: 'Partner version' })).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Cases' })).toBeNull()
      expect(screen.getByRole('heading', { name: /Running/ })).toBeTruthy()
      expect(screen.getByText(/Will run 3 cases against/)).toBeTruthy()
    })
  })

  describe('choosing cases', () => {
    const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement
    const unfold = async (user: ReturnType<typeof userEvent.setup>, service: string) =>
      user.click(await screen.findByRole('button', { name: `Show the ${service} cases` }))

    it('runs exactly the cases ticked, one case alone included', async () => {
      const user = userEvent.setup()
      const { client, created } = fakeClient()
      renderPage(client)
      await user.click(await screen.findByRole('button', { name: 'None' }))
      await unfold(user, 'earn')
      await user.click(box(/Earning twice adds the points once/))
      await user.click(screen.getByRole('button', { name: 'Run 1 case' }))
      await waitFor(() => expect(created).toHaveLength(1))
      expect(created[0]!.cases).toEqual(['earn/duplicate-reference'])
    })

    it('unticking one case of a group leaves the others, and the group shows it is partly chosen', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient()
      renderPage(client)
      await unfold(user, 'earn')
      await user.click(await screen.findByRole('checkbox', { name: /Earning adds exactly/ }))
      expect(box(/Earning adds exactly/).checked).toBe(false)
      expect(box(/Earning twice adds/).checked).toBe(true)
      const group = box(/^earn/)
      expect(group.checked).toBe(false)
      expect(group.indeterminate).toBe(true)
      expect(screen.getByRole('button', { name: 'Run 2 cases' })).toBeTruthy()
    })

    it('turns a whole group on from partly chosen, and off from all chosen', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient()
      renderPage(client)
      await unfold(user, 'earn')
      await unfold(user, 'security')
      await user.click(await screen.findByRole('checkbox', { name: /Earning adds exactly/ }))
      await user.click(box(/^earn/)) // some → all
      expect(box(/Earning adds exactly/).checked).toBe(true)
      expect(box(/^earn/).checked).toBe(true)
      expect(box(/^earn/).indeterminate).toBe(false)
      await user.click(box(/^earn/)) // all → none
      expect(box(/Earning adds exactly/).checked).toBe(false)
      expect(box(/Earning twice adds/).checked).toBe(false)
      expect(box(/A correctly signed/).checked).toBe(true) // another group, untouched
    })

    it('starts folded, and unfolds one group without the others', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient()
      renderPage(client)
      await screen.findByRole('button', { name: 'Show the earn cases' })
      expect(screen.queryByText('Earning adds exactly the points earned')).toBeNull()
      expect(screen.queryByText('A correctly signed request is accepted')).toBeNull()

      await unfold(user, 'earn')
      expect(screen.getByText('Earning adds exactly the points earned')).toBeTruthy()
      expect(screen.queryByText('A correctly signed request is accepted')).toBeNull()
      const hide = screen.getByRole('button', { name: 'Hide the earn cases' })
      expect(hide.getAttribute('aria-expanded')).toBe('true')
      expect(document.getElementById(hide.getAttribute('aria-controls')!)).toBeTruthy()
    })

    it('keeps what is chosen when a group is folded and unfolded, and its box works while folded', async () => {
      const user = userEvent.setup()
      const { client, created } = fakeClient()
      renderPage(client)
      await unfold(user, 'earn')
      await user.click(await screen.findByRole('checkbox', { name: /Earning adds exactly/ }))
      await user.click(screen.getByRole('button', { name: 'Hide the earn cases' }))
      expect(screen.getByText('1 of 2')).toBeTruthy() // earn, folded, still says what is chosen
      expect(box(/^earn/).indeterminate).toBe(true)

      await unfold(user, 'earn')
      expect(box(/Earning adds exactly/).checked).toBe(false)
      expect(box(/Earning twice adds/).checked).toBe(true)

      await user.click(screen.getByRole('button', { name: 'Hide the earn cases' }))
      await user.click(box(/^earn/)) // some → all, with the cases out of sight
      expect(screen.getByRole('button', { name: 'Run 3 cases' })).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Run 3 cases' }))
      await waitFor(() => expect(created).toHaveLength(1))
      expect(created[0]!.cases).toContain('earn/adds-points')
    })

    it('has All and None, which say how many are chosen', async () => {
      const user = userEvent.setup()
      const { client } = fakeClient()
      renderPage(client)
      expect(await screen.findByText('3 of 3 chosen')).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'None' }))
      expect(screen.getByText('0 of 3 chosen')).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'All' }))
      expect(screen.getByText('3 of 3 chosen')).toBeTruthy()
    })
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

  it('cannot start with no case chosen', async () => {
    const user = userEvent.setup()
    const { client, created } = fakeClient()
    renderPage(client)
    await user.click(await screen.findByRole('button', { name: 'None' }))
    expect(screen.getByText('Choose at least one case.')).toBeTruthy()
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

  describe('bringing the lanes into view', () => {
    const narrow = (matches: boolean) => {
      const scrolled: string[] = []
      // Matches only the query the page asks about, so a changed query is noticed.
      window.matchMedia = ((query: string) => ({
        matches: matches && query === '(max-width: 860px)',
        media: query,
      })) as unknown as typeof window.matchMedia
      Element.prototype.scrollIntoView = function () {
        scrolled.push(this.getAttribute('aria-labelledby') ?? '')
      }
      return scrolled
    }

    it('scrolls to them when the run begins where the form sits above them', async () => {
      const scrolled = narrow(true)
      const user = userEvent.setup()
      const { client } = fakeClient({ hold: true })
      renderPage(client)
      await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
      await waitFor(() => expect(scrolled).toEqual(['live']))
    })

    it('leaves the page where it is when the lanes sit beside the form', async () => {
      const scrolled = narrow(false)
      const user = userEvent.setup()
      const { client } = fakeClient({ hold: true })
      renderPage(client)
      await user.click(await screen.findByRole('button', { name: 'Run 3 cases' }))
      await screen.findByRole('button', { name: 'Running…' })
      expect(scrolled).toEqual([])
    })
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
