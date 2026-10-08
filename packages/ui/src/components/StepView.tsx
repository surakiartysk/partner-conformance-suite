import type { StepRecord } from '../api'
import {
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

function expectedLines(step: StepRecord, marked: Set<string>): JsonLine[] {
  const expected = step.expected ?? {}
  const lines: JsonLine[] = []
  if (expected.status !== undefined) {
    lines.push({ ...text(`status ${expected.status}`), marked: marked.has('status') })
  }
  for (const [name, value] of Object.entries(expected.headers ?? {})) {
    const key = `header ${name.toLowerCase()}`
    const described = /^‹(.*)›$/s.exec(String(value))
    lines.push({
      ...text(described ? described[1]! : String(value)),
      head: `${name}: `,
      matcher: described !== null,
      marked: marked.has(key),
    })
  }
  if ('body' in expected) lines.push(...jsonLines(expected.body, marked))
  return lines
}

function actualLines(step: StepRecord, marked: Set<string>): JsonLine[] {
  const response = step.response
  if (!response) return []
  const lines: JsonLine[] = [{ ...text(`status ${response.status}`), marked: marked.has('status') }]
  for (const name of Object.keys(step.expected?.headers ?? {})) {
    const key = `header ${name.toLowerCase()}`
    const sent = response.headers[name.toLowerCase()]
    lines.push({ ...text(`${name}: ${sent ?? '(none)'}`), marked: marked.has(key) })
  }
  if (!response.json) return lines.concat(text(String(response.body)))
  return lines.concat(jsonLines(response.body, marked))
}

export function StepView({ step }: { step: StepRecord }) {
  const outcome = OUTCOME[step.outcome]
  const marked = mismatchPaths(step)
  const body = bodyLines(step.request.body)
  const judged = !isSetup(step)
  const actual = actualLines(step, marked)
  return (
    <div className="step">
      <header>
        <span>
          <b>
            {PHASE_LABEL[step.phase]} · {step.name}
          </b>
        </span>
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
              <JsonBlock lines={expectedLines(step, marked)} />
            ) : (
              <p className="note">Nothing is expected of this step beyond an answer.</p>
            )}
          </div>
          <div className="pane">
            <h4>Actual</h4>
            {step.response.truncated ? (
              <p className="note">Only the start of a long answer was kept.</p>
            ) : null}
            <JsonBlock lines={actual} />
          </div>
        </div>
      ) : null}
      <Headers label="Request headers" headers={step.request.headers} />
      {step.response ? <Headers label="Response headers" headers={step.response.headers} /> : null}
    </div>
  )
}
