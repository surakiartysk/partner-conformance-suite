import { CASES } from '@conformance/cases'
import { beforeAll, describe, expect, it } from 'vitest'
import { executeCase } from '../src/runner/execute'
import { migratePartner, provisionTarget, toPartner } from './helpers'

/**
 * Every case against the reference partner that implements the spec
 * correctly. Each must pass: a case that fails against a correct partner is
 * a wrong case.
 */

beforeAll(migratePartner)

const failures = (result: Awaited<ReturnType<typeof executeCase>>) =>
  result.steps
    .filter((step) => step.outcome !== 'ok')
    .map((step) => ({ step: step.name, mismatches: step.mismatches, error: step.error }))

describe('every case against the correct reference partner', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s passes', async (_, definition) => {
    const target = await provisionTarget()
    const result = await executeCase(definition, target, { transport: toPartner })
    expect(failures(result)).toEqual([])
    expect(result.status).toBe('passed')
  })

  /**
   * One tenant, every case, in order — the way a run will use it. Each case
   * reads its own starting balance, so cases that move points before it cannot
   * make its expectations wrong.
   */
  it('all pass one after another against a single tenant', async () => {
    const target = await provisionTarget()
    const statuses: Record<string, string> = {}
    for (const definition of CASES) {
      statuses[definition.id] = (
        await executeCase(definition, target, { transport: toPartner })
      ).status
    }
    expect(Object.values(statuses).every((s) => s === 'passed')).toBe(true)
    expect(Object.keys(statuses)).toHaveLength(CASES.length)
  })
})
