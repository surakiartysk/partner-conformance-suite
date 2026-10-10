import type { StepRecord } from '../api'
import {
  alignBodies,
  bodyLines,
  isSetup,
  jsonLines,
  mismatchPaths,
  PHASE_LABEL,
  type JsonLine,
} from '../result-model'
import { JsonBlock } from './JsonBlock'

const OUTCOME = {
  ok: { cls: 'pass', mark: '✓', word: 'Matched' },
  mismatch: { cls: 'fail', mark: '✕', word: 'Did not match' },
  timed_out: { cls: 'warn', mark: '!', word: 'Timed out' },
  error: { cls: 'err', mark: '!', word: 'Error' },
} as const

const text = (t: string): JsonLine => ({
  head: '',
  value: t,
  tail: '',
  matcher: false,
  path: '',
  marked: false,
})

/** One line saying what was sent and what came back. */
function requestLine(step: StepRecord) {
  const answer = step.response ? String(step.response.status) : 'no answer'
  return `${step.request.method} ${step.request.path} → ${answer} · ${step.durationMs} ms`
}

function Headers({ label, headers }: { label: string; headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0) return null
  const hidden = entries.filter(([, v]) => v === '•••').length
  return (
    <details>
      <summary>
        {label} ({entries.length - hidden} shown, {hidden} hidden)
      </summary>
      <pre className="json">{entries.map(([name, value]) => `${name}: ${value}\n`).join('')}</pre>
    </details>
  )
}

/** What the case expects: its status and headers, then the body it checks, if it checks one. */
function expectedParts(step: StepRecord, marked: Set<string>) {
  const expected = step.expected ?? {}
  const head: JsonLine[] = []
  if (expected.status !== undefined) {
    head.push({ ...text(`status ${expected.status}`), marked: marked.has('status') })
  }
  for (const [name, value] of Object.entries(expected.headers ?? {})) {
    const key = `header ${name.toLowerCase()}`
    const described = /^‹(.*)›$/s.exec(String(value))
    head.push({
      ...text(described ? described[1]! : String(value)),
      head: `${name}: `,
      matcher: described !== null,
      marked: marked.has(key),
    })
  }
  const body = 'body' in expected ? jsonLines(expected.body, marked) : null
  return { head, body }
}

/** What the partner answered: status, the headers the case looks at, then the body. */
function actualParts(step: StepRecord, marked: Set<string>) {
  const response = step.response
  if (!response) return { head: [] as JsonLine[], body: null, json: false }
  const head: JsonLine[] = [{ ...text(`status ${response.status}`), marked: marked.has('status') }]
  for (const name of Object.keys(step.expected?.headers ?? {})) {
    const key = `header ${name.toLowerCase()}`
    const sent = response.headers[name.toLowerCase()]
    head.push({ ...text(`${name}: ${sent ?? '(none)'}`), marked: marked.has(key) })
  }
  if (!response.json)
    return { head: head.concat(text(String(response.body))), body: null, json: false }
  return { head, body: jsonLines(response.body, marked), json: true }
}

/** The two panes' lines. Where both have a body they are laid side by side line for line. */
function panes(step: StepRecord, marked: Set<string>) {
  const e = expectedParts(step, marked)
  const a = actualParts(step, marked)
  if (e.body && a.body) {
    const both = alignBodies(e.body, a.body)
    return { expected: [...e.head, ...both.expected], actual: [...a.head, ...both.actual] }
  }
  if (a.body) {
    // A step that expects only a status still got a body back: say that the body is not checked, on
    // the first of as many lines as the answer has, so the two panes are the same height.
    const empty = a.body.map((line, i) => ({
      head: '',
      value: i === 0 ? 'body: not checked' : '',
      tail: '',
      matcher: true,
      path: line.path,
      marked: false,
    }))
    return { expected: [...e.head, ...empty], actual: [...a.head, ...a.body] }
  }
  return { expected: [...e.head, ...(e.body ?? [])], actual: [...a.head] }
}

export function StepView({ step }: { step: StepRecord }) {
  const outcome = OUTCOME[step.outcome]
  const marked = mismatchPaths(step)
  const body = bodyLines(step.request.body)
  const judged = !isSetup(step)
  const shown = panes(step, marked)
  return (
    <div className="step">
      <header>
        <h3 className="step-title">
          {PHASE_LABEL[step.phase]} · {step.name}
        </h3>
        <span className={`st ${outcome.cls}`}>
          <span aria-hidden="true">{outcome.mark}</span>
          {outcome.word}
        </span>
      </header>
      <div className="pane">
        <div className="req mono">{requestLine(step)}</div>
      </div>
      {step.error ? (
        <div className="pane">
          <h4>What happened</h4>
          <p className="problem">{step.error}</p>
        </div>
      ) : null}
      <div className="pane">
        <h4>Request body</h4>
        {body === null ? (
          <p className="note">none</p>
        ) : typeof body === 'string' ? (
          <pre className="json">{body}</pre>
        ) : (
          <JsonBlock lines={body} />
        )}
      </div>
      {step.response ? (
        <div className="two">
          <div className="pane">
            <h4>{judged || step.expected ? 'Expected' : 'Response'}</h4>
            {step.expected ? (
              <JsonBlock lines={shown.expected} />
            ) : (
              <p className="note">Nothing is expected of this step beyond an answer.</p>
            )}
          </div>
          <div className="pane">
            <h4>Actual</h4>
            {step.response.truncated ? (
              <p className="note">Only the start of a long answer was kept.</p>
            ) : null}
            <JsonBlock lines={shown.actual} />
          </div>
        </div>
      ) : null}
      <Headers label="Request headers" headers={step.request.headers} />
      {step.response ? <Headers label="Response headers" headers={step.response.headers} /> : null}
    </div>
  )
}
