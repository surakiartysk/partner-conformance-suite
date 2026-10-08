import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CaseInfo, RunView } from '../src/api'
import { Lanes } from '../src/components/Lanes'
import { RunForm } from '../src/components/RunForm'
import { RunSummary } from '../src/components/RunSummary'
import { Status } from '../src/components/Status'
import { applyEvent, initialProgress, type Progress } from '../src/progress'

const info = (id: string, name: string): CaseInfo => ({
  id,
  service: 'earn',
  name,
  description: '',
  member: 'A',
  writes: true,
})
const cases = new Map([
  ['a/1', info('a/1', 'Earning adds points')],
  ['a/2', info('a/2', 'Earning twice adds once')],
])
const run: RunView = {
  id: 'run_1',
  version: 'double-earn',
  services: ['earn'],
  createdAt: '',
  finishedAt: null,
  lanes: [{ lane: 'A', cases: ['a/1', 'a/2'], position: 0, done: false, restore: null }],
  results: [],
}
const finishAll = (statuses: ('passed' | 'failed')[], restore = true): Progress => {
  let p = initialProgress(run)
  statuses.forEach((status, i) => {
    p = applyEvent(p, { type: 'case', lane: 'A', caseId: `a/${i + 1}`, status, durationMs: 5 })
  })
  return applyEvent(p, {
    type: 'lane-done',
    lane: 'A',
    restore: restore
      ? { status: 'restored', target: 1000 }
      : { status: 'not-restored', target: 1000 },
  })
}

describe('Status', () => {
  it('says each status with a word as well as a colour', () => {
    for (const [status, word] of [
      ['passed', 'Passed'],
      ['failed', 'Failed'],
      ['timed_out', 'Timed out'],
      ['error', 'Error'],
      ['running', 'Running'],
      ['waiting', 'Waiting'],
      ['not-run', 'Not run'],
    ] as const) {
      expect(renderToStaticMarkup(<Status status={status} />)).toContain(word)
    }
  })

  it('keeps timed out apart from failed, in word and in look', () => {
    const failed = renderToStaticMarkup(<Status status="failed" />)
    const timedOut = renderToStaticMarkup(<Status status="timed_out" />)
    expect(failed).toContain('st fail')
    expect(timedOut).toContain('st warn')
    expect(timedOut).not.toContain('Failed')
  })
})

describe('the Run form', () => {
  type Props = Parameters<typeof RunForm>[0]
  const render = (o: Partial<Props> = {}) =>
    renderToStaticMarkup(
      <RunForm
        versions={['correct', 'double-earn']}
        version="double-earn"
        onVersion={() => {}}
        services={['security', 'earn']}
        allServices={['security', 'earn', 'redeem']}
        onToggleService={() => {}}
        caseCount={14}
        onSubmit={() => {}}
        busy={false}
        problem={null}
        {...o}
      />,
    )

  it('offers every version as a radio button, with the chosen one checked', () => {
    const html = render()
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toMatch(/value="double-earn"[^>]*checked|checked[^>]*value="double-earn"/)
    expect(html).not.toMatch(/value="correct"[^>]*checked/)
  })

  it('says what is wrong with no version but only that it is wrong, and what correct is', () => {
    const html = render()
    expect(html).toContain('Implements the spec')
    expect(html).toContain('wrong in one way')
    expect(html).not.toContain('ignores')
  })

  it('shows each service as a checkbox, the chosen ones checked', () => {
    const html = render()
    expect(html.match(/type="checkbox"/g)).toHaveLength(3)
    expect(html.match(/type="checkbox" checked/g)).toHaveLength(2)
  })

  it('puts the number of cases on the button, and says case when there is one', () => {
    expect(render({ caseCount: 14 })).toContain('Run 14 cases')
    expect(render({ caseCount: 1 })).toContain('Run 1 case<')
  })

  it('cannot be submitted with no service chosen, and says why', () => {
    const html = render({ services: [], caseCount: 0 })
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Run 0 cases/)
    expect(html).toContain('Choose at least one service')
  })

  it('locks every control while a run is going', () => {
    const html = render({ busy: true })
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Running…/)
    expect(html.match(/type="radio"[^>]*disabled/g)).toHaveLength(2)
    expect(html.match(/type="checkbox"[^>]*disabled/g)).toHaveLength(3)
  })

  it('says why starting failed, as an alert', () => {
    expect(render({ problem: 'Too many runs.' })).toMatch(/role="alert"[^>]*>Too many runs\./)
  })

  it('keeps the submit button and the reason it failed together at the foot of the form', () => {
    const html = render({ problem: 'Too many runs.' })
    expect(html).toMatch(
      /<div class="form-actions"><button type="submit"[^>]*>Run 14 cases<\/button><p role="alert"[^>]*>Too many runs\.<\/p><\/div><\/form>/,
    )
  })

  it('has exactly one primary button', () => {
    expect(render().match(/class="primary"/g)).toHaveLength(1)
  })
})

describe('the lanes', () => {
  it('name each case and show its id, with the status beside it', () => {
    const p = applyEvent(initialProgress(run), {
      type: 'case',
      lane: 'A',
      caseId: 'a/1',
      status: 'passed',
      durationMs: 3,
    })
    const html = renderToStaticMarkup(<Lanes progress={p} cases={cases} />)
    expect(html).toContain('Earning adds points')
    expect(html).toContain('a/1')
    expect(html).toContain('Passed')
    expect(html).toContain('Running') // the second case
    expect(html).toContain('1 / 2')
  })

  it('fall back to the id as the name for a case it has no name for', () => {
    const html = renderToStaticMarkup(<Lanes progress={initialProgress(run)} cases={new Map()} />)
    // Once as the name and once as the id line beneath it.
    expect(html.match(/a\/1/g)).toHaveLength(2)
  })

  it('say what a lane is waiting for, and when it will try again', () => {
    const p = applyEvent(initialProgress(run), {
      type: 'waiting',
      lane: 'A',
      failure: 'member-busy',
      seconds: 5,
    })
    const html = renderToStaticMarkup(<Lanes progress={p} cases={cases} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Trying again in 5 s')
  })

  it('say a lane stopped, and why, as an alert', () => {
    const p = applyEvent(initialProgress(run), {
      type: 'lane-failed',
      lane: 'A',
      failure: 'no-session',
    })
    const html = renderToStaticMarkup(<Lanes progress={p} cases={cases} />)
    expect(html).toContain('This lane stopped')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Not run')
  })

  it('draw a progress bar that counts finished cases', () => {
    const p = applyEvent(initialProgress(run), {
      type: 'case',
      lane: 'A',
      caseId: 'a/1',
      status: 'failed',
      durationMs: 3,
    })
    const html = renderToStaticMarkup(<Lanes progress={p} cases={cases} />)
    expect(html).toMatch(/<progress[^>]*value="1"[^>]*max="2"|<progress[^>]*max="2"[^>]*value="1"/)
  })

  it('show a case name as text, never as markup', () => {
    const hostile = new Map([['a/1', info('a/1', '<img src=x onerror=alert(1)>')]])
    const html = renderToStaticMarkup(<Lanes progress={initialProgress(run)} cases={hostile} />)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('the summary', () => {
  const render = (p: Progress) =>
    renderToStaticMarkup(
      <RunSummary
        progress={p}
        cases={cases}
        version="double-earn"
        runId="run_1"
        onRunAgain={() => {}}
        onNavigate={() => {}}
      />,
    )

  it('says all passed when they did, and lists nothing that did not pass', () => {
    const html = render(finishAll(['passed', 'passed']))
    expect(html).toContain('All 2 cases passed')
    expect(html).not.toContain('<table')
  })

  it('says how many did not pass, and lists those cases with their ids', () => {
    const html = render(finishAll(['passed', 'failed']))
    expect(html).toContain('1 of 2 cases did not pass')
    expect(html).toContain('Earning twice adds once')
    expect(html).toContain('a/2')
    expect(html).not.toContain('Earning adds points')
  })

  it('counts passed and failed separately', () => {
    const html = render(finishAll(['passed', 'failed']))
    expect(html).toContain('✓ 1 passed')
    expect(html).toContain('✕ 1 failed')
  })

  it('names the version that was run', () => {
    expect(render(finishAll(['passed', 'passed']))).toContain('double-earn')
  })

  it('says no points moved when nothing was owed, rather than that they were given back', () => {
    let p = initialProgress(run)
    p = applyEvent(p, { type: 'lane-done', lane: 'A', restore: { status: 'nothing-owed' } })
    const html = render(p)
    expect(html).toContain('No points moved.')
    expect(html).not.toContain('Points given back')
  })

  it('says the points were given back, or that they were not yet, and never claims more', () => {
    expect(render(finishAll(['passed', 'passed'], true))).toContain('Points given back')
    const notAll = render(finishAll(['passed', 'passed'], false))
    expect(notAll).toContain('could not be given back yet')
    expect(notAll).not.toContain('Points given back.')
  })

  it('does not call a run that stopped early a pass', () => {
    const stopped = applyEvent(initialProgress(run), {
      type: 'lane-failed',
      lane: 'A',
      failure: 'unexpected',
    })
    const html = render(stopped)
    expect(html).not.toContain('All 2 cases passed')
    expect(html).toContain('2 of 2 cases did not pass')
    expect(html).toContain('2 not run')
  })

  it('offers to open the result, as the one primary button, and to run again', () => {
    const html = render(finishAll(['passed', 'passed']))
    expect(html).toContain('>Open the result</button>')
    expect(html).toContain('>Run again</button>')
    expect(html.match(/class="primary"/g)).toHaveLength(1)
  })

  it('links each case that did not pass to its result', () => {
    const html = render(finishAll(['passed', 'failed']))
    expect(html).toContain('href="/runs/run_1/cases/a/2"')
    expect(html).not.toContain('href="/runs/run_1/cases/a/1"')
  })
})
