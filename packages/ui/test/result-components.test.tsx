import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CaseResult } from '../src/api'
import { CaseDetail } from '../src/components/CaseDetail'
import { CaseList } from '../src/components/CaseList'
import { StepView } from '../src/components/StepView'
import { VersionReveal } from '../src/components/VersionReveal'
import { groupCases } from '../src/result-model'
import { CASES, CORRECT, DOUBLE_EARN, PLAIN_ERRORS, SLOW_BALANCE, VERSIONS } from './fixtures-runs'

const byId = new Map(CASES.map((c) => [c.id, c]))
const result = (run: typeof DOUBLE_EARN, id: string): CaseResult =>
  run.results.find((r) => r.caseId === id)!.result

const detail = (run: typeof DOUBLE_EARN, id: string, lane = 'A') =>
  renderToStaticMarkup(
    <CaseDetail info={byId.get(id)} caseId={id} lane={lane} result={result(run, id)} />,
  )

describe('a case that did not match', () => {
  const html = detail(DOUBLE_EARN, 'earn/duplicate-reference')

  it('names the case, its id and its lane, and says what it is about', () => {
    expect(html).toContain('Earning twice with one reference adds the points once')
    expect(html).toContain('earn/duplicate-reference · Member A')
    expect(html).toContain('About Earning twice')
  })

  it('says first what did not match, one sentence for each field', () => {
    expect(html).toContain('What didn&#x27;t match')
    expect(html).toMatch(
      /transactionId should be &quot;txn_\w+&quot;; the partner answered &quot;txn_\w+&quot;\./,
    )
    expect(html).toContain('balance should be balance at start + 100 = 1,')
  })

  it('keeps the setup in one closed section, only checked that the partner answers', () => {
    expect(html).toMatch(
      /<details class="setup"><summary>Setup · 2 steps, only checked that the partner answers<\/summary>/,
    )
    expect(html).not.toMatch(/<details class="setup" open/)
  })

  it('shows the act and the verify steps open, each with its request and what came back', () => {
    expect(html).toContain('Act · repeat')
    expect(html).toContain('Verify · balance')
    expect(html.match(/<h4>Request body<\/h4>/g)!.length).toBeGreaterThanOrEqual(4) // setup too
  })

  it('puts Expected and Actual in a pair, so they sit side by side', () => {
    expect(html).toMatch(/<div class="two"><div class="pane"><h4>Expected<\/h4>/)
  })

  it('does not say it passed', () => {
    expect(html).not.toContain('Everything this case checks matched')
  })
})

describe('a case that passed', () => {
  const html = detail(CORRECT, 'earn/duplicate-reference')

  it('says everything it checks matched, and what it does not check', () => {
    expect(html).toContain('Everything this case checks matched')
    expect(html).toContain('Fields in an answer that the case does not name are not checked')
    expect(html).not.toContain('What didn&#x27;t match')
  })

  it('counts the setup steps, not the judged ones: this case reads the balance and nothing else', () => {
    const passed = detail(DOUBLE_EARN, 'earn/adds-points')
    expect(passed).toContain('Setup · 1 step, only checked that the partner answers')
    expect(html).toContain('Setup · 2 steps, only checked that the partner answers')
  })

  it('still shows the steps, so a pass can be compared with a failure', () => {
    expect(html).toContain('Act · repeat')
    expect(html).toContain('Matched')
  })
})

describe('a step', () => {
  const step = (run: typeof DOUBLE_EARN, id: string, phase: string) =>
    result(run, id).steps.find((s) => s.phase === phase)!

  it('shows the request line: method, path, the status that came back, and the time', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')} />,
    )
    expect(html).toMatch(/POST \/points\/earn → 200 · \d+ ms/)
  })

  it('shows the request body as it was sent, laid out', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')} />,
    )
    expect(html).toContain('&quot;points&quot;: ')
    expect(html).toContain('100')
    expect(html).toContain('&quot;reference&quot;: ')
  })

  it('shows Expected and Actual side by side, with the lines that disagreed marked', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')} />,
    )
    expect(html).toContain('<h4>Expected</h4>')
    expect(html).toContain('<h4>Actual</h4>')
    expect(html.match(/class="ln bad"/g)).toHaveLength(4) // two fields, on each side
  })

  it('shows what a matcher expects as words, not as a quoted string with brackets', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')} />,
    )
    expect(html).toMatch(/<span class="matcher">balance at start \+ 100 = 1,\d{3}<\/span>/)
    expect(html).not.toContain('‹')
  })

  it('marks nothing in a step that matched', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(CORRECT, 'earn/duplicate-reference', 'act')} />,
    )
    expect(html).not.toContain('class="ln bad"')
    expect(html).toContain('✓')
  })

  it('shows a body that is not JSON as the text it is, with the status and the header that disagreed', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(PLAIN_ERRORS, 'member/unknown', 'act')} />,
    )
    expect(html).toContain('Member not found')
    expect(html).toContain('status 404')
    expect(html).toMatch(
      /class="ln bad">content-type: <span class="matcher">media type application\/problem\+json<\/span>/,
    )
  })

  it('says a step that got no answer timed out, with what the server recorded, and shows no answer', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(SLOW_BALANCE, 'member/balance', 'act')} />,
    )
    expect(html).toContain('Timed out')
    expect(html).toContain('no response within 10000 ms')
    expect(html).toContain('no answer')
    expect(html).not.toContain('<h4>Actual</h4>')
  })

  it('counts the headers it shows and the ones it hides', () => {
    const html = renderToStaticMarkup(
      <StepView step={step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')} />,
    )
    expect(html).toMatch(/Request headers \(4 shown, 0 hidden\)/)
    expect(html).toMatch(/Response headers \(1 shown, 0 hidden\)/)
  })

  it('counts a header whose value was withheld as hidden', () => {
    const base = step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')
    const hidden = {
      ...base,
      response: {
        ...base.response!,
        headers: { 'content-type': 'application/json', 'set-cookie': '•••' },
      },
    }
    expect(renderToStaticMarkup(<StepView step={hidden} />)).toMatch(
      /Response headers \(1 shown, 1 hidden\)/,
    )
  })

  /**
   * What a partner answers is the one part of this page nobody on our side
   * wrote. It is shown as text, whatever it says: in the body, in a header, in
   * the error a failure left, and in a request path.
   */
  it('shows what a partner wrote as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const base = step(DOUBLE_EARN, 'earn/duplicate-reference', 'act')
    const html = renderToStaticMarkup(
      <StepView
        step={{
          ...base,
          error: hostile,
          response: {
            ...base.response!,
            body: { transactionId: hostile, balance: hostile },
            headers: { 'content-type': hostile },
          },
        }}
      />,
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('shows a body that is not JSON as text too, and says when only the start of it was kept', () => {
    const base = step(PLAIN_ERRORS, 'member/unknown', 'act')
    const html = renderToStaticMarkup(
      <StepView
        step={{
          ...base,
          response: { ...base.response!, body: '<b>big</b>', truncated: true },
        }}
      />,
    )
    expect(html).toContain('&lt;b&gt;big&lt;/b&gt;')
    expect(html).not.toContain('<b>big')
    expect(html).toContain('Only the start of a long answer was kept')
  })
})

describe('the list of cases', () => {
  const render = (selected: string | undefined) =>
    renderToStaticMarkup(
      <CaseList
        groups={groupCases(DOUBLE_EARN)}
        cases={byId}
        selected={selected}
        hrefFor={(id) => `/runs/run_1/cases/${id}`}
        onSelect={() => {}}
      />,
    )

  it('shows the groups, each case by name and by id, with its status', () => {
    const html = render(undefined)
    expect(html).toContain('Did not pass · 1')
    expect(html).toContain('Member A · 2 passed')
    expect(html).toContain('Earning adds exactly the points earned')
    expect(html).toContain('earn/adds-points')
    expect(html).toContain('Failed')
  })

  it('gives each case an address, so it can be opened in another tab', () => {
    expect(render(undefined)).toContain('href="/runs/run_1/cases/earn/duplicate-reference"')
  })

  it('marks the open case as current, and only that one', () => {
    const html = render('earn/duplicate-reference')
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="true"[^>]*>(?:(?!<\/a>).)*earn\/duplicate-reference/s)
  })
})

describe('what was wrong with a version', () => {
  const render = (version: string, ran: string[]) =>
    renderToStaticMarkup(
      <VersionReveal
        version={version}
        info={VERSIONS.find((v) => v.name === version)}
        cases={byId}
        ran={new Set(ran)}
      />,
    )

  it('says the bug, which case catches it, and how many others pass a partner with it', () => {
    const html = render('double-earn', ['earn/duplicate-reference'])
    expect(html).toContain('ignores reference on an earn')
    expect(html).toContain('Earning twice with one reference adds the points once')
    expect(html).toContain(`The other ${CASES.length - 1} cases pass a partner with this bug`)
  })

  it('says a case it names was not part of this run, rather than implying it passed or failed', () => {
    const html = render('plain-errors', ['member/unknown'])
    expect(html).toContain('earn/unknown-member')
    expect(html).toMatch(/earn\/unknown-member<\/span><span class="note"> — not part of this run/)
    expect(html).not.toMatch(/member\/unknown<\/span><span class="note"> — not part of this run/)
  })

  it('says the right version is correct, and that passing it proves little about catching', () => {
    const html = render('correct', [])
    expect(html).toContain('is the correct partner')
    expect(html).toContain('not that a wrong one would be caught')
    expect(html).not.toContain('The bug')
  })

  it('says nothing when the server had nothing to say about the version', () => {
    expect(
      renderToStaticMarkup(
        <VersionReveal version="x" info={undefined} cases={byId} ran={new Set()} />,
      ),
    ).toBe('')
  })

  it('shows the bug as text, never as markup', () => {
    const html = renderToStaticMarkup(
      <VersionReveal
        version="x"
        info={{ name: 'x', bug: '<img src=x onerror=alert(1)>', status: 'failed', catches: [] }}
        cases={byId}
        ran={new Set()}
      />,
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
