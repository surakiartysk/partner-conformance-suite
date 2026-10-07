import type { CaseInfo } from './api'

/**
 * What the Run form chooses from, and what it chooses by default.
 */

/** Services in the order the cases first name them. */
export function servicesOf(cases: CaseInfo[]): string[] {
  return [...new Set(cases.map((c) => c.service))]
}

/** The cases a run of these services would plan. */
export function casesFor(cases: CaseInfo[], services: string[]): CaseInfo[] {
  return cases.filter((c) => services.includes(c.service))
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

export function toggleService(selected: string[], all: string[], service: string): string[] {
  const next = selected.includes(service)
    ? selected.filter((s) => s !== service)
    : [...selected, service]
  // Kept in the order the cases name them, whatever order they were chosen in.
  return all.filter((s) => next.includes(s))
}

/**
 * Whether the form may be submitted: something chosen to run, and no run going.
 * One rule for the button and for the Enter key, which submits without it.
 */
export const canSubmit = (services: string[], busy: boolean) => services.length > 0 && !busy
