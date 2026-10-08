import type { CaseInfo, Lane } from '../api'
import { messageFor } from '../messages'
import { rows, type LaneProgress, type Progress } from '../progress'
import { Status } from './Status'

const TITLE: Record<Lane, string> = { read: 'Read-only', A: 'Member A', B: 'Member B' }

interface Props {
  progress: Progress
  /** Every case, by id, for the names. */
  cases: Map<string, CaseInfo>
}

function LaneCard({ lane, cases }: { lane: LaneProgress; cases: Map<string, CaseInfo> }) {
  const list = rows(lane)
  const done = list.filter((r) =>
    ['passed', 'failed', 'timed_out', 'error'].includes(r.status),
  ).length
  return (
    <div className="lane">
      <header>
        {TITLE[lane.lane]}
        <span className="mono">
          {done} / {list.length}
        </span>
      </header>
      <progress value={done} max={list.length} aria-label={`${TITLE[lane.lane]} progress`} />
      {list.map((row) => (
        <div className={row.status === 'running' ? 'row now' : 'row'} key={row.caseId}>
          <span className="lane-title">
            {cases.get(row.caseId)?.name ?? row.caseId}
            <br />
            <span className="id mono note">{row.caseId}</span>
          </span>
          <Status status={row.status} />
        </div>
      ))}
      {lane.waiting ? (
        <div className="lane-note" role="status">
          {messageFor(lane.waiting.failure)} Trying again in {lane.waiting.seconds} s.
        </div>
      ) : null}
      {lane.failure ? (
        <div className="lane-note" role="alert">
          This lane stopped. {messageFor(lane.failure)}
        </div>
      ) : null}
    </div>
  )
}

export function Lanes({ progress, cases }: Props) {
  return (
    <div className="lanes">
      {progress.lanes.map((lane) => (
        <LaneCard key={lane.lane} lane={lane} cases={cases} />
      ))}
    </div>
  )
}
