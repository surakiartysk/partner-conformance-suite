// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError, type Client, type RunView } from '../src/api'
import { ResultPage } from '../src/components/ResultPage'
import type { Route } from '../src/route'
import { CASES, CORRECT, DOUBLE_EARN, SLOW_BALANCE, VERSIONS } from './fixtures-runs'

afterEach(cleanup)

function client(run: RunView | ApiError) {
  const asked: string[] = []
  const c = {
    getRun: async (id: string) => {
      asked.push(id)
      if (run instanceof ApiError) throw run
      return run
    },
    listCases: async () => CASES,
    listVersions: async () => VERSIONS,
  } as unknown as Client
  return { client: c, asked }
}

const show = (
  run: RunView | ApiError,
  caseId?: string,
  onNavigate: (to: Route) => void = () => {},
) => {
  const { client: c, asked } = client(run)
  render(<ResultPage client={c} runId="run_1" caseId={caseId} onNavigate={onNavigate} />)
  return { asked }
}

describe('the result page', () => {
  it('waits for the run, then asks for it by its id', async () => {
    const { asked } = show(DOUBLE_EARN)
    expect(screen.getByText('Loading…')).toBeTruthy()
    await screen.findByText('1 of 4 cases did not pass')
    expect(asked).toEqual(['run_1'])
  })

  it('says the verdict first: how many cases did not pass, with the counts and the points', async () => {
    show(DOUBLE_EARN)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      '1 of 4 cases did not pass',
    )
    expect(screen.getByText('✓ 3 passed')).toBeTruthy()
    expect(screen.getByText('✕ 1 failed')).toBeTruthy()
    expect(
      screen.getByText('Points given back. Both members are at their starting balances.'),
    ).toBeTruthy()
  })

  it('names the version, the number of cases and the time the run took', async () => {
    show(DOUBLE_EARN)
    await screen.findByText(/double-earn · 4 cases/)
  })

  it('opens the first case that did not pass when none was asked for', async () => {
    show(DOUBLE_EARN)
    const detail = await screen.findByRole('article')
    expect(within(detail).getByRole('heading', { level: 2 }).textContent).toBe(
      'Earning twice with one reference adds the points once',
    )
    expect(within(detail).getByText("What didn't match")).toBeTruthy()
  })

  it('opens the case the address names, even one that passed', async () => {
    show(DOUBLE_EARN, 'earn/adds-points')
    const detail = await screen.findByRole('article')
    expect(within(detail).getByRole('heading', { level: 2 }).textContent).toBe(
      'Earning adds exactly the points earned',
    )
    expect(within(detail).getByText(/Everything this case checks matched/)).toBeTruthy()
  })

  it('goes to another case when it is chosen in the list, and not to a new page', async () => {
    const user = userEvent.setup()
    const went: Route[] = []
    show(DOUBLE_EARN, undefined, (to) => went.push(to))
    const list = await screen.findByRole('navigation', { name: 'Cases' })
    await user.click(within(list).getByRole('link', { name: /Earning zero points is refused/ }))
    expect(went).toEqual([{ page: 'result', runId: 'run_1', caseId: 'earn/invalid-points' }])
  })

  it('leaves a modified click to the browser, so a case opens in a new tab and not here', async () => {
    const user = userEvent.setup()
    const went: Route[] = []
    show(DOUBLE_EARN, undefined, (to) => went.push(to))
    const list = await screen.findByRole('navigation', { name: 'Cases' })
    const link = within(list).getByRole('link', { name: /Earning zero points is refused/ })
    for (const key of ['Control', 'Meta', 'Shift']) {
      await user.keyboard(`{${key}>}`)
      await user.click(link)
      await user.keyboard(`{/${key}}`)
    }
    expect(went).toEqual([])
    expect(link.getAttribute('href')).toBe('/runs/run_1/cases/earn/invalid-points')
  })

  it('offers to run another version, as the one primary button', async () => {
    const user = userEvent.setup()
    const went: Route[] = []
    show(DOUBLE_EARN, undefined, (to) => went.push(to))
    await user.click(await screen.findByRole('button', { name: 'Run again' }))
    expect(went).toEqual([{ page: 'run' }])
  })

  it('says no points moved, not that they were given back, when no lane could have moved any', async () => {
    show(SLOW_BALANCE)
    await screen.findByText('1 of 3 cases did not pass')
    expect(screen.getByText('No points moved.')).toBeTruthy()
    expect(screen.queryByText(/Points given back/)).toBeNull()
  })

  it('says which lane a case that has not run belongs to', async () => {
    const unfinished: RunView = { ...DOUBLE_EARN, results: DOUBLE_EARN.results.slice(0, 2) }
    show(unfinished, 'earn/invalid-points')
    const detail = await screen.findByRole('article')
    expect(within(detail).getByText('earn/invalid-points · Member A')).toBeTruthy()
  })

  it('says what was wrong with the version, below the cases', async () => {
    show(DOUBLE_EARN)
    expect(await screen.findByText(/What was wrong with/)).toBeTruthy()
    expect(screen.getByText(/ignores reference on an earn/)).toBeTruthy()
  })

  it('calls a run that passed everything passed, and says the right version is correct', async () => {
    show(CORRECT)
    await screen.findByText('All 4 cases passed')
    expect(screen.getByText(/is the correct partner/)).toBeTruthy()
  })

  it('calls a case that got no answer timed out, apart from one that failed', async () => {
    show(SLOW_BALANCE)
    await screen.findByText('1 of 3 cases did not pass')
    expect(screen.getByText('! 1 timed out').className).toContain('warn')
    expect(screen.getByText('✓ 2 passed').className).toContain('pass')
    expect(screen.queryByText(/✕ \d+ failed/)).toBeNull()
  })

  it('says a run that has not finished has not, rather than giving a verdict', async () => {
    const unfinished: RunView = {
      ...DOUBLE_EARN,
      finishedAt: null,
      results: DOUBLE_EARN.results.slice(0, 2),
    }
    show(unfinished)
    await screen.findByText('2 of 4 cases done so far')
  })

  it('says why the run could not be shown, and shows no result', async () => {
    show(new ApiError('not-found', 404))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('no such run')
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('says so when the session has ended', async () => {
    show(new ApiError('no-session', 401))
    expect((await screen.findByRole('alert')).textContent).toContain('no session')
  })

  it('shows a case it has no result for as not run, instead of failing', async () => {
    show(DOUBLE_EARN, 'security/valid-signature')
    const detail = await screen.findByRole('article')
    await waitFor(() => expect(within(detail).getByText('This case has not run.')).toBeTruthy())
  })
})

/*
 * Found by the design review of the result page on the live site: the verdict h1 wore `.problem`,
 * which sets 13px, so it was smaller than the mono line above it; "What was wrong with double-earn"
 * was the last thing on the page, under 1,700px of cases; and the steps' h4s sat under an h2 with no
 * h3 between.
 */
describe('the order and weight of the result page', () => {
  it('colours a verdict that is not a pass without making it small', async () => {
    show(DOUBLE_EARN)
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.className).toBe('verdict-bad')
    expect(h1.className).not.toContain('problem')
  })

  it('says what was wrong with the version before the cases, not after them', async () => {
    show(DOUBLE_EARN)
    const reveal = await screen.findByRole('heading', { name: /What was wrong with/ })
    const firstCase = screen.getByRole('article')
    expect(
      reveal.compareDocumentPosition(firstCase) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('titles each step with an h3, so its h4s have a heading above them', async () => {
    show(DOUBLE_EARN)
    const detail = await screen.findByRole('article')
    const steps = within(detail).getAllByRole('heading', { level: 3 })
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.map((h) => h.textContent)).toContain('Act · repeat')
    expect(within(detail).getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(0)
  })
})
