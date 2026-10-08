import { useEffect, useState } from 'react'
import { ApiError, type Client, type RunListItem } from '../api'
import { messageFor } from '../messages'
import type { Route } from '../route'
import { History } from './History'

export function HistoryPage({
  client,
  now,
  onNavigate,
}: {
  client: Client
  now: number
  onNavigate: (to: Exclude<Route, { page: 'not-found' }>) => void
}) {
  const [runs, setRuns] = useState<RunListItem[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    client
      .listRuns()
      .then((list) => current && setRuns(list))
      .catch(
        (error) =>
          current &&
          setProblem(
            error instanceof ApiError
              ? messageFor(error.failure, error.retryAfter)
              : messageFor('unexpected'),
          ),
      )
    return () => {
      current = false
    }
  }, [client])

  return (
    <>
      <h1>History</h1>
      <p className="lede">The runs of this session, newest first. Open one to read its cases.</p>
      {problem ? (
        <p role="alert" className="problem">
          {problem}
        </p>
      ) : runs === null ? (
        <p className="note">Loading…</p>
      ) : (
        <History runs={runs} now={now} onNavigate={onNavigate} />
      )}
    </>
  )
}
