import { describe, expect, it } from 'vitest'
import { ApiError, type CaseStatus, type Lane, type NextAnswer, type RunView } from '../src/api'
import { driveRun, type DriveEvent } from '../src/driver'

function run(lanes: Lane[], done: Lane[] = []): RunView {
  return {
    id: 'run_1',
    version: 'correct',
    services: [],
    createdAt: '',
    finishedAt: null,
    lanes: lanes.map((lane) => ({
      lane,
      cases: [`${lane}/one`, `${lane}/two`],
      position: 0,
      done: done.includes(lane),
      restore: null,
    })),
    results: [],
  }
}

const caseAnswer = (lane: Lane, caseId: string, status: CaseStatus = 'passed'): NextAnswer => ({
  lane,
  done: false,
  result: { caseId, status, durationMs: 12 },
})
const doneAnswer = (lane: Lane): NextAnswer => ({
  lane,
  done: true,
  restore: lane === 'read' ? null : { status: 'restored', target: 1000 },
})

/** A client whose answers for each lane are a script, and which remembers what it was asked. */
function scripted(script: Record<string, (NextAnswer | ApiError)[]>) {
  const asked: string[] = []
  const next = async (runId: string, lane: Lane) => {
    asked.push(`${runId}/${lane}`)
    const step = script[lane]!.shift()
    if (!step) throw new Error(`no more answers for ${lane}`)
    if (step instanceof ApiError) throw step
    return step
  }
  return { client: { next }, asked }
}

const noSleep = async () => {}

async function drive(
  client: { next: (id: string, lane: Lane) => Promise<NextAnswer> },
  r: RunView,
  extra: { signal?: AbortSignal; maxWaits?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const events: DriveEvent[] = []
  await driveRun(client, r, {
    signal: extra.signal ?? new AbortController().signal,
    onEvent: (e) => events.push(e),
    sleep: extra.sleep ?? noSleep,
    maxWaits: extra.maxWaits,
  })
  return events
}

describe('driving a run', () => {
  it('asks each lane for its next case until the lane is done, then stops', async () => {
    const { client, asked } = scripted({
      A: [caseAnswer('A', 'A/one'), caseAnswer('A', 'A/two'), doneAnswer('A')],
    })
    const events = await drive(client, run(['A']))
    expect(asked).toEqual(['run_1/A', 'run_1/A', 'run_1/A'])
    expect(events.map((e) => e.type)).toEqual(['case', 'case', 'lane-done'])
  })

  it('reports each case with its status and how long it took', async () => {
    const { client } = scripted({
      A: [caseAnswer('A', 'A/one', 'failed'), doneAnswer('A')],
    })
    const events = await drive(client, run(['A']))
    expect(events[0]).toEqual({
      type: 'case',
      lane: 'A',
      caseId: 'A/one',
      status: 'failed',
      durationMs: 12,
    })
  })

  it('reports how the member lane ended, and null for the read lane', async () => {
    const { client } = scripted({ read: [doneAnswer('read')], A: [doneAnswer('A')] })
    const events = await drive(client, run(['read', 'A']))
    const done = events.filter((e) => e.type === 'lane-done')
    expect(done).toContainEqual({ type: 'lane-done', lane: 'read', restore: null })
    expect(done).toContainEqual({
      type: 'lane-done',
      lane: 'A',
      restore: { status: 'restored', target: 1000 },
    })
  })

  it('drives the lanes at the same time, not one after the other', async () => {
    const order: string[] = []
    const release: Record<string, () => void> = {}
    const next = (_: string, lane: Lane) =>
      new Promise<NextAnswer>((resolve) => {
        order.push(`ask ${lane}`)
        release[lane] = () => resolve(doneAnswer(lane))
      })
    const events: DriveEvent[] = []
    const finished = driveRun({ next }, run(['read', 'A', 'B']), {
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
      sleep: noSleep,
    })
    await Promise.resolve()
    // Every lane has asked before any has been answered.
    expect(order.sort()).toEqual(['ask A', 'ask B', 'ask read'])
    release.read!()
    release.A!()
    release.B!()
    await finished
    expect(events).toHaveLength(3)
  })

  it('leaves a lane that is already done alone', async () => {
    const { client, asked } = scripted({ A: [doneAnswer('A')] })
    await drive(client, run(['read', 'A'], ['read']))
    expect(asked).toEqual(['run_1/A'])
  })

  describe('when the server says wait', () => {
    it('waits for the time the server named when a member is held, then asks again', async () => {
      const { client, asked } = scripted({
        A: [new ApiError('member-busy', 423, 7), caseAnswer('A', 'A/one'), doneAnswer('A')],
      })
      const slept: number[] = []
      const events = await drive(client, run(['A']), { sleep: async (ms) => void slept.push(ms) })
      expect(slept).toEqual([7000])
      expect(asked).toHaveLength(3)
      expect(events[0]).toEqual({ type: 'waiting', lane: 'A', failure: 'member-busy', seconds: 7 })
    })

    it('chooses its own wait when the server did not name one, longer for a held member', async () => {
      const { client } = scripted({
        A: [new ApiError('member-busy', 423), new ApiError('lane-busy', 409), doneAnswer('A')],
      })
      const slept: number[] = []
      await drive(client, run(['A']), { sleep: async (ms) => void slept.push(ms) })
      expect(slept).toEqual([5000, 2000])
    })

    it('gives up on a lane after too many waits in a row, and says why', async () => {
      const busy = () => new ApiError('member-busy', 423, 1)
      const { client } = scripted({ A: [busy(), busy(), busy(), busy()] })
      const events = await drive(client, run(['A']), { maxWaits: 3 })
      expect(events.filter((e) => e.type === 'waiting')).toHaveLength(3)
      expect(events.at(-1)).toEqual({ type: 'lane-failed', lane: 'A', failure: 'member-busy' })
    })

    it('counts waits in a row, not in all: an answer in between starts the count again', async () => {
      const busy = () => new ApiError('member-busy', 423, 1)
      const { client } = scripted({
        A: [busy(), busy(), caseAnswer('A', 'A/one'), busy(), busy(), doneAnswer('A')],
      })
      const events = await drive(client, run(['A']), { maxWaits: 2 })
      expect(events.at(-1)?.type).toBe('lane-done')
    })
  })

  describe('when something else goes wrong', () => {
    it('stops that lane, with the reason, and carries on with the others', async () => {
      const { client } = scripted({
        A: [new ApiError('no-session', 401)],
        B: [caseAnswer('B', 'B/one'), doneAnswer('B')],
      })
      const events = await drive(client, run(['A', 'B']))
      expect(events).toContainEqual({ type: 'lane-failed', lane: 'A', failure: 'no-session' })
      expect(events).toContainEqual({
        type: 'lane-done',
        lane: 'B',
        restore: { status: 'restored', target: 1000 },
      })
    })

    it('does not retry an error it was not told to wait out', async () => {
      const { client, asked } = scripted({ A: [new ApiError('unavailable', 502)] })
      await drive(client, run(['A']))
      expect(asked).toHaveLength(1)
    })

    it('reports an error it does not recognise as unexpected', async () => {
      const next = async (): Promise<NextAnswer> => {
        throw new TypeError('boom')
      }
      const events = await drive({ next }, run(['A']))
      expect(events).toEqual([{ type: 'lane-failed', lane: 'A', failure: 'unexpected' }])
    })
  })

  describe('when the visitor leaves', () => {
    it('stops asking, and reports nothing for the answer that was in flight', async () => {
      const abort = new AbortController()
      let resolveNext!: (a: NextAnswer) => void
      const asked: string[] = []
      const next = (_: string, lane: Lane) => {
        asked.push(lane)
        return new Promise<NextAnswer>((r) => (resolveNext = r))
      }
      const events: DriveEvent[] = []
      const finished = driveRun({ next }, run(['A']), {
        signal: abort.signal,
        onEvent: (e) => events.push(e),
        sleep: noSleep,
      })
      await Promise.resolve()
      abort.abort()
      resolveNext(caseAnswer('A', 'A/one'))
      await finished
      expect(asked).toEqual(['A'])
      expect(events).toEqual([])
    })

    it('does not start at all if it has already left', async () => {
      const abort = new AbortController()
      abort.abort()
      const { client, asked } = scripted({ A: [] })
      expect(await drive(client, run(['A']), { signal: abort.signal })).toEqual([])
      expect(asked).toEqual([])
    })

    it('wakes from a wait at once instead of sleeping it out', async () => {
      const abort = new AbortController()
      const { client } = scripted({ A: [new ApiError('member-busy', 423, 3600)] })
      const events: DriveEvent[] = []
      const finished = driveRun(client, run(['A']), {
        signal: abort.signal,
        onEvent: (e) => events.push(e),
      })
      await new Promise((r) => setTimeout(r, 10))
      abort.abort()
      await finished // would take an hour if the sleep ignored the signal
      expect(events.map((e) => e.type)).toEqual(['waiting'])
    })
  })
})
