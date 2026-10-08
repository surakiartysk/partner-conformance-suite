import { useEffect, useMemo, useState } from 'react'
import { ApiError, type CaseInfo, type Client, type RunView, type VersionInfo } from '../api'
import { givenBackText } from '../given-back'
import { messageFor } from '../messages'
import { counts, initialProgress } from '../progress'
import { pathFor, type Route } from '../route'
import { defaultCase, formatSeconds, groupCases, runSeconds } from '../result-model'
import { CaseDetail } from './CaseDetail'
import { CaseList } from './CaseList'
import { VersionReveal } from './VersionReveal'

type Known = Exclude<Route, { page: 'not-found' }>

interface Props {
  client: Client
  runId: string
  /** The case asked for in the address, if any. */
  caseId: string | undefined
  onNavigate: (to: Known) => void
}

interface Loaded {
  run: RunView
  cases: CaseInfo[]
  versions: VersionInfo[]
}

const problemOf = (error: unknown) =>
  error instanceof ApiError ? messageFor(error.failure, error.retryAfter) : messageFor('unexpected')

export function ResultPage({ client, runId, caseId, onNavigate }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    setLoaded(null)
    setProblem(null)
    Promise.all([client.getRun(runId), client.listCases(), client.listVersions()])
      .then(([run, cases, versions]) => current && setLoaded({ run, cases, versions }))
      .catch((error) => current && setProblem(problemOf(error)))
    return () => {
      current = false
    }
  }, [client, runId])

  const byId = useMemo(() => new Map((loaded?.cases ?? []).map((c) => [c.id, c])), [loaded])

  if (problem) {
    return (
      <>
        <h1>Result</h1>
        <p role="alert" className="problem">
          {problem}
        </p>
      </>
    )
  }
  if (!loaded) return <p className="note">Loading…</p>

  const { run, versions } = loaded
  const progress = initialProgress(run)
  const c = counts(progress)
  const selected = caseId ?? defaultCase(run)
  const entry = run.results.find((r) => r.caseId === selected)
  const lane =
    entry?.lane ?? run.lanes.find((l) => l.cases.includes(selected ?? ''))?.lane ?? 'read'
  const notPassed = c.total - c.passed
  const seconds = runSeconds(run)
  const ran = new Set(run.lanes.flatMap((l) => l.cases))

  return (
    <>
      <section className="card verdict" aria-labelledby="verdict">
        <div>
          <div className="mono note">
            {run.version} · {c.total} {c.total === 1 ? 'case' : 'cases'}
            {seconds === null ? '' : ` · ${formatSeconds(seconds)}`}
          </div>
          <h1 id="verdict" className={notPassed === 0 && c.finished === c.total ? '' : 'problem'}>
            {run.finishedAt === null && c.finished < c.total
              ? `${c.finished} of ${c.total} cases done so far`
              : notPassed === 0
                ? `All ${c.total} cases passed`
                : `${notPassed} of ${c.total} ${c.total === 1 ? 'case' : 'cases'} did not pass`}
          </h1>
          <div className="counts">
            <span className="st pass">✓ {c.passed} passed</span>
            {c.failed > 0 ? <span className="st fail">✕ {c.failed} failed</span> : null}
            {c.timedOut > 0 ? <span className="st warn">! {c.timedOut} timed out</span> : null}
            {c.error > 0 ? <span className="st err">! {c.error} error</span> : null}
          </div>
          <p className="note">{givenBackText(progress)}</p>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={() => onNavigate({ page: 'run' })}>
            Run again
          </button>
        </div>
      </section>

      <div className="split">
        <div className="detail">
          {selected ? (
            <CaseDetail
              info={byId.get(selected)}
              caseId={selected}
              lane={lane}
              result={entry?.result}
            />
          ) : (
            <p className="note">This run has no cases.</p>
          )}
        </div>
        <div className="side">
          <CaseList
            groups={groupCases(run)}
            cases={byId}
            selected={selected}
            hrefFor={(id) => pathFor({ page: 'result', runId, caseId: id })}
            onSelect={(id) => onNavigate({ page: 'result', runId, caseId: id })}
          />
        </div>
      </div>

      <VersionReveal
        version={run.version}
        info={versions.find((v) => v.name === run.version)}
        cases={byId}
        ran={ran}
      />
    </>
  )
}
