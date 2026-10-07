import type { CaseInfo } from '../api'
import { counts, pointsGivenBack, rows, type Progress } from '../progress'
import { Status } from './Status'

const GIVEN_BACK = {
  all: 'Points given back. Both members are at their starting balances.',
  'not-all':
    'Some points could not be given back yet. They are written down, and a later run or the sweep every ten minutes will give them back.',
  unknown:
    'A lane stopped before it could give its points back. They are written down, and a later run or the sweep every ten minutes will give them back.',
  'none-moved': 'No points moved.',
} as const

interface Props {
  progress: Progress
  cases: Map<string, CaseInfo>
  version: string
  onRunAgain: () => void
}

/** The verdict first, then what did not pass. Reading a case's request and answer is not built yet. */
export function RunSummary({ progress, cases, version, onRunAgain }: Props) {
  const c = counts(progress)
  const notPassed = c.total - c.passed
  const unfinished = c.total - c.finished
  const headline =
    notPassed === 0
      ? `All ${c.total} cases passed`
      : `${notPassed} of ${c.total} ${c.total === 1 ? 'case' : 'cases'} did not pass`
  const trouble = progress.lanes.flatMap((lane) =>
    rows(lane)
      .filter((r) => r.status !== 'passed')
      .map((r) => ({ ...r, lane: lane.lane })),
  )
  return (
    <section aria-labelledby="verdict">
      <div className="mono note">{version}</div>
      <h2 id="verdict" className={notPassed === 0 ? '' : 'problem'}>
        {headline}
      </h2>
      <div className="counts">
        <span className="st pass">✓ {c.passed} passed</span>
        {c.failed > 0 ? <span className="st fail">✕ {c.failed} failed</span> : null}
        {c.timedOut > 0 ? <span className="st warn">! {c.timedOut} timed out</span> : null}
        {c.error > 0 ? <span className="st err">! {c.error} error</span> : null}
        {unfinished > 0 ? <span className="st idle">{unfinished} not run</span> : null}
      </div>
      <p className="note">{GIVEN_BACK[pointsGivenBack(progress)]}</p>
      {trouble.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {trouble.map((row) => (
              <tr key={row.caseId}>
                <td>
                  {cases.get(row.caseId)?.name ?? row.caseId}
                  <br />
                  <span className="mono note">{row.caseId}</span>
                </td>
                <td>
                  <Status status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="actions">
        <button type="button" className="primary" onClick={onRunAgain}>
          Run again
        </button>
      </div>
    </section>
  )
}
