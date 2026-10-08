import type { CaseInfo } from './api'

/**
 * What the Run form chooses from, and what it chooses by default.
 */

/** The cases of one service, in the order the server lists them. */
export interface Group {
  service: string
  cases: CaseInfo[]
}

/** The cases by service, services in the order the cases first name them. */
export function groupCases(cases: CaseInfo[]): Group[] {
  const groups: Group[] = []
  for (const c of cases) {
    const group = groups.find((g) => g.service === c.service)
    if (group) group.cases.push(c)
    else groups.push({ service: c.service, cases: [c] })
  }
  return groups
}

/**
 * The version chosen before the visitor chooses. A wrong one, so that a first
 * run shows a red case within a minute: a first run that is all green teaches
 * nothing about what the suite catches. `double-earn` if the server offers it,
 * otherwise the first version that is not `correct`.
 */
export function defaultVersion(versions: string[]): string {
  if (versions.includes('double-earn')) return 'double-earn'
  return versions.find((v) => v !== 'correct') ?? versions[0] ?? 'correct'
}

/** `correct` first, then the others as the server lists them. */
export function orderVersions(versions: string[]): string[] {
  return [...versions.filter((v) => v === 'correct'), ...versions.filter((v) => v !== 'correct')]
}

/** Every id in `all` that is in `selected`: the order the cases are listed in, whatever order they were chosen in. */
const inListOrder = (all: string[], selected: Iterable<string>) => {
  const chosen = new Set(selected)
  return all.filter((id) => chosen.has(id))
}

export function toggleCase(selected: string[], all: string[], id: string): string[] {
  return inListOrder(
    all,
    selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
  )
}

/** All of a group's cases on or off, leaving the rest as they were. */
export function chooseCases(
  selected: string[],
  all: string[],
  ids: string[],
  on: boolean,
): string[] {
  return inListOrder(all, on ? [...selected, ...ids] : selected.filter((s) => !ids.includes(s)))
}

/** How much of a group is chosen: all of it, some of it, none of it. */
export function groupState(selected: string[], ids: string[]): 'all' | 'some' | 'none' {
  const n = ids.filter((id) => selected.includes(id)).length
  return n === 0 ? 'none' : n === ids.length ? 'all' : 'some'
}

/**
 * Whether the form may be submitted: something chosen to run, and no run going.
 * One rule for the button and for the Enter key, which submits without it.
 */
export const canSubmit = (chosen: number, busy: boolean) => chosen > 0 && !busy
