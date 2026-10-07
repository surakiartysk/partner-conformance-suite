import {
  ApiError,
  type CaseStatus,
  type Failure,
  type Lane,
  type NextAnswer,
  type Restore,
  type RunView,
} from './api'

/**
 * Drives a run: for each lane, ask the server for the next case until it says
 * the lane is done.
 *
 * The page decides nothing here. It names a run and a lane; the server picks
 * the case, builds and signs the request, sends it and judges the answer
 * (decision 22). What the page owns is the pace: when a member is held by
 * another run (`423`) or the lane is being driven from another tab (`409`) it
 * waits and asks again, and when the visitor leaves it stops asking.
 */

export type DriveEvent =
  | { type: 'case'; lane: Lane; caseId: string; status: CaseStatus; durationMs: number }
  | { type: 'waiting'; lane: Lane; failure: 'member-busy' | 'lane-busy'; seconds: number }
  | { type: 'lane-done'; lane: Lane; restore: Restore | null }
  | { type: 'lane-failed'; lane: Lane; failure: Failure }

export interface DriveOptions {
  signal: AbortSignal
  onEvent: (event: DriveEvent) => void
  /** Waits that long, or less if the signal fires. Replaced in tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  /**
   * How many waits in a row before giving up on a lane. A member's lock lapses
   * after five minutes, so the default outlasts one.
   */
  maxWaits?: number
}

export const DEFAULT_MAX_WAITS = 80

/** Seconds to wait when the server did not say: a held member is likelier to stay held. */
const DEFAULT_WAIT_SECONDS = { 'member-busy': 5, 'lane-busy': 2 } as const

const realSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })

type Next = (runId: string, lane: Lane) => Promise<NextAnswer>

export async function driveRun(
  client: { next: Next },
  run: RunView,
  options: DriveOptions,
): Promise<void> {
  await Promise.all(
    run.lanes.filter((l) => !l.done).map((l) => driveLane(client, run.id, l.lane, options)),
  )
}

async function driveLane(
  client: { next: Next },
  runId: string,
  lane: Lane,
  { signal, onEvent, sleep = realSleep, maxWaits = DEFAULT_MAX_WAITS }: DriveOptions,
): Promise<void> {
  // Nothing is reported after the visitor has left: the answer in flight is dropped.
  const emit = (event: DriveEvent) => {
    if (!signal.aborted) onEvent(event)
  }
  let waits = 0

  while (!signal.aborted) {
    let answer
    try {
      answer = await client.next(runId, lane)
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.failure === 'member-busy' || error.failure === 'lane-busy')
      ) {
        if (++waits > maxWaits) return emit({ type: 'lane-failed', lane, failure: error.failure })
        const seconds = error.retryAfter ?? DEFAULT_WAIT_SECONDS[error.failure]
        emit({ type: 'waiting', lane, failure: error.failure, seconds })
        await sleep(seconds * 1000, signal)
        continue
      }
      const failure = error instanceof ApiError ? error.failure : 'unexpected'
      return emit({ type: 'lane-failed', lane, failure })
    }

    waits = 0
    if (answer.result) {
      emit({
        type: 'case',
        lane,
        caseId: answer.result.caseId,
        status: answer.result.status,
        durationMs: answer.result.durationMs,
      })
    }
    if (answer.done) return emit({ type: 'lane-done', lane, restore: answer.restore ?? null })
  }
}
