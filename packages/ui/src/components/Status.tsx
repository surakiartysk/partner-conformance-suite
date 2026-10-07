import type { RowStatus } from '../progress'

const LOOK: Record<RowStatus, { cls: string; mark: string; word: string }> = {
  passed: { cls: 'pass', mark: '✓', word: 'Passed' },
  failed: { cls: 'fail', mark: '✕', word: 'Failed' },
  timed_out: { cls: 'warn', mark: '!', word: 'Timed out' },
  error: { cls: 'err', mark: '!', word: 'Error' },
  running: { cls: 'run', mark: '', word: 'Running' },
  waiting: { cls: 'idle', mark: '', word: 'Waiting' },
  'not-run': { cls: 'idle', mark: '', word: 'Not run' },
}

/** A status as colour, a mark and a word: never colour alone. */
export function Status({ status }: { status: RowStatus }) {
  const { cls, mark, word } = LOOK[status]
  return (
    <span className={`st ${cls}`}>
      {status === 'running' ? <i className="spin" aria-hidden="true" /> : null}
      {mark ? <span aria-hidden="true">{mark}</span> : null}
      {word}
    </span>
  )
}
