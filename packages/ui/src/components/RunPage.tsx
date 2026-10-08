import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, type CaseInfo, type Client, type RunView, type SessionView } from '../api'
import type { Route } from '../route'
import { driveRun } from '../driver'
import { messageFor } from '../messages'
import { applyEvent, counts, initialProgress, isOver, type Progress } from '../progress'
import { casesFor, defaultVersion, orderVersions, servicesOf, toggleService } from '../run-form'
import { Lanes } from './Lanes'
import { RunForm } from './RunForm'
import { RunSummary } from './RunSummary'

type Phase = 'idle' | 'starting' | 'running' | 'over'

const problemOf = (error: unknown) =>
  error instanceof ApiError ? messageFor(error.failure, error.retryAfter) : messageFor('unexpected')

export function RunPage({
  client,
  session,
  onNavigate,
}: {
  client: Client
  session: SessionView
  onNavigate: (to: Exclude<Route, { page: 'not-found' }>) => void
}) {
  const [cases, setCases] = useState<CaseInfo[] | null>(null)
  const [loadProblem, setLoadProblem] = useState<string | null>(null)

  const versions = useMemo(() => orderVersions(session.partner.versions), [session])
  const [version, setVersion] = useState(() => defaultVersion(session.partner.versions))
  const [services, setServices] = useState<string[] | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const [ranVersion, setRanVersion] = useState(version)
  const [runId, setRunId] = useState('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const controller = useRef<AbortController | null>(null)
  const livePanel = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let current = true
    client
      .listCases()
      .then((list) => current && setCases(list))
      .catch((error) => current && setLoadProblem(problemOf(error)))
    return () => {
      current = false
    }
  }, [client])

  // Where the form and the lanes sit one under the other, the lanes are far below
  // the button that was just pressed; bring them into view when the run begins.
  useEffect(() => {
    if (phase !== 'running') return
    if (window.matchMedia?.('(max-width: 860px)').matches) livePanel.current?.scrollIntoView?.()
  }, [phase])

  // Leaving the page stops the asking. What the run moved is written down on
  // the server and is given back by a later run or the sweep.
  useEffect(() => () => controller.current?.abort(), [])

  const byId = useMemo(() => new Map((cases ?? []).map((c) => [c.id, c])), [cases])
  const allServices = useMemo(() => servicesOf(cases ?? []), [cases])
  const chosen = services ?? allServices

  const start = async () => {
    setPhase('starting')
    setProblem(null)
    let run: RunView
    try {
      run = await client.createRun(version, chosen)
    } catch (error) {
      setProblem(problemOf(error))
      setPhase('idle')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setRanVersion(run.version)
    setRunId(run.id)
    setProgress(initialProgress(run))
    setPhase('running')
    await driveRun(client, run, {
      signal: abort.signal,
      onEvent: (event) => setProgress((p) => (p ? applyEvent(p, event) : p)),
    })
    if (!abort.signal.aborted) setPhase('over')
  }

  if (loadProblem) {
    return (
      <>
        <h1>Run</h1>
        <p role="alert" className="problem">
          {loadProblem}
        </p>
      </>
    )
  }
  if (!cases) return <p className="note">Loading…</p>

  const running = phase === 'starting' || phase === 'running'
  const live = progress && phase !== 'idle'
  const c = progress ? counts(progress) : null

  return (
    <>
      <h1>Run</h1>
      <p className="lede">
        Pick a partner and what to check. Each case is a signed request from the suite, and the
        verdict is decided on the server.
      </p>
      <div className="grid">
        <RunForm
          versions={versions}
          version={version}
          onVersion={setVersion}
          services={chosen}
          allServices={allServices}
          onToggleService={(s) => setServices(toggleService(chosen, allServices, s))}
          caseCount={casesFor(cases, chosen).length}
          onSubmit={start}
          busy={running}
          problem={problem}
        />
        {live && progress ? (
          <section className="card" aria-labelledby="live" ref={livePanel}>
            {phase === 'over' && isOver(progress) ? (
              <RunSummary
                progress={progress}
                cases={byId}
                version={ranVersion}
                runId={runId}
                onNavigate={onNavigate}
                onRunAgain={() => {
                  setPhase('idle')
                  setProgress(null)
                }}
              />
            ) : (
              <>
                <div className="live-head">
                  <h2 id="live">
                    Running <span className="mono">{ranVersion}</span>
                  </h2>
                  <span className="mono note">
                    {c?.finished} of {c?.total} done
                  </span>
                </div>
                <p className="note">
                  Read-only cases run together. Each member&apos;s cases run one at a time, because
                  two cases moving one balance at once would corrupt each other&apos;s expectations.
                </p>
              </>
            )}
            <Lanes progress={progress} cases={byId} />
            {phase === 'running' ? (
              <p className="note">
                Leaving this page stops the run. The points it moved are written down first and
                given back by a later run or the sweep that runs every ten minutes.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  )
}
