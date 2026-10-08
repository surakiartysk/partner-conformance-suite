import type { RunListItem } from '../api'
import { ago } from '../format'
import type { Route } from '../route'
import { PageLink } from './Layout'

type Known = Exclude<Route, { page: 'not-found' }>

/** How a run has gone, as chips: everything that did not pass is named, and a run that is not over says so. */
function Outcome({ run }: { run: RunListItem }) {
  const { passed, failed, timedOut, error } = run.counts
  const ended = passed + failed + timedOut + error
  const notPassed = failed + timedOut + error
  return (
    <span className="counts">
      {run.finishedAt === null ? (
        <span className="st idle">
          Not finished · {ended} of {run.total}
        </span>
      ) : null}
      {notPassed === 0 && run.finishedAt !== null && run.total > 0 ? (
        <span className="st pass">✓ All {run.total} passed</span>
      ) : (
        <>
          {passed > 0 ? <span className="st pass">✓ {passed} passed</span> : null}
          {failed > 0 ? <span className="st fail">✕ {failed} failed</span> : null}
          {timedOut > 0 ? <span className="st warn">! {timedOut} timed out</span> : null}
          {error > 0 ? <span className="st err">! {error} error</span> : null}
        </>
      )}
    </span>
  )
}

interface Props {
  runs: RunListItem[]
  now: number
  onNavigate: (to: Known) => void
}

/** The runs of this session, newest first, each a link to its result. */
export function History({ runs, now, onNavigate }: Props) {
  if (runs.length === 0) {
    return (
      <div className="card">
        <h2>No runs yet</h2>
        <p className="note">Run a version of the partner and it will be listed here.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => onNavigate({ page: 'run' })}>
            Go to Run
          </button>
        </div>
      </div>
    )
  }
  return (
    <ul className="runs">
      {runs.map((run) => (
        <li key={run.id}>
          <PageLink
            to={{ page: 'result', runId: run.id }}
            onNavigate={onNavigate}
            className="run-row"
          >
            <span className="run-head">
              <span className="mono">{run.version}</span>
              <time dateTime={run.createdAt} className="note">
                {ago(run.createdAt, now)}
              </time>
            </span>
            <Outcome run={run} />
            <span className="note">
              {run.services.join(', ')} · {run.total} {run.total === 1 ? 'case' : 'cases'}
            </span>
          </PageLink>
        </li>
      ))}
    </ul>
  )
}
