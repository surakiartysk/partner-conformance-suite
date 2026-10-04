import type { CaseDefinition, MemberSlot } from './define'

/**
 * Which cases may run at the same time.
 *
 * Not "money runs one at a time, the rest in parallel". What makes an
 * expectation wrong is two cases changing the same member's balance at once:
 * each reads a starting balance the other is about to move. So cases that
 * write are queued per member, in their declared order, and everything else
 * — reads, and cases about members nobody writes to — runs alongside.
 */
export interface Lanes {
  /** Cases that change no balance. Any order, any concurrency. */
  readOnly: CaseDefinition[]
  /** Per member, the cases that may change that member's balance, in order. */
  members: Record<MemberSlot, CaseDefinition[]>
}

export function planLanes(cases: readonly CaseDefinition[]): Lanes {
  const lanes: Lanes = { readOnly: [], members: { A: [], B: [] } }
  for (const definition of cases) {
    if (definition.writes) lanes.members[definition.member].push(definition)
    else lanes.readOnly.push(definition)
  }
  return lanes
}
