import { CASES } from '@conformance/cases'
import { beforeAll, describe, expect, it } from 'vitest'
import { VARIANT_NAMES } from '../../partner/src/variants'
import table from '../../../docs/variants.md?raw'
import { executeCase, type CaseStatus } from '../src/runner/execute'
import { migratePartner, provisionTarget, toPartner } from './helpers'

/**
 * Every case against every version of the reference partner, held to the
 * tables in docs/variants.md.
 *
 * That file is the document and also the data: this test parses it. The
 * expectation cannot be a second copy somewhere in code that drifts from what
 * the document says.
 *
 * Both directions are checked. A case that fails where the table does not
 * expect it fails for a reason nobody has understood; a case the table expects
 * to fail and that passes is not checking what it claims. Where the two
 * disagree, find out why before touching the table.
 */

beforeAll(migratePartner)

const ids = (cell: string) => [...cell.matchAll(/`([a-z]+\/[a-z-]+)`/g)].map((m) => m[1]!)

interface Row {
  version: string
  status: CaseStatus | null
  cases: string[]
}

function section(heading: string): string {
  const start = table.indexOf(heading)
  if (start < 0) throw new Error(`docs/variants.md has no section "${heading}"`)
  const next = table.indexOf('\n## ', start + heading.length)
  return table.slice(start, next < 0 ? undefined : next)
}

function parseVersions(): Row[] {
  return section('## What each version does wrong')
    .split('\n')
    .filter((line) => /^\| `/.test(line))
    .map((line) => {
      const [, version, , status, cases] = line.split('|').map((cell) => cell.trim())
      return {
        version: version!.replaceAll('`', ''),
        status: status === '—' ? null : (status!.replaceAll('`', '') as CaseStatus),
        cases: ids(cases!),
      }
    })
}

const ROWS = parseVersions()

const UNCOVERED = section('## Cases no version makes fail')
  .split('\n')
  .filter((line) => line.startsWith('- `'))
  .map((line) => ids(line)[0]!)

/** Runs each case on a tenant of its own, so no case sees another's effects. */
async function runAll(version: string): Promise<Record<string, CaseStatus>> {
  const results: Record<string, CaseStatus> = {}
  for (const definition of CASES) {
    const target = await provisionTarget(version)
    const { status } = await executeCase(definition, target, {
      transport: toPartner,
      // `slow-balance` holds a balance read for 15 s unless it is abandoned.
      timeoutMs: version === 'slow-balance' ? 300 : 10_000,
    })
    results[definition.id] = status
  }
  return results
}

describe('docs/variants.md', () => {
  it('lists every version the partner serves, and no other', () => {
    expect(ROWS.map((row) => row.version).sort()).toEqual([...VARIANT_NAMES].sort())
  })

  it('names only cases that exist', () => {
    const known = new Set(CASES.map((c) => c.id))
    const named = [...ROWS.flatMap((row) => row.cases), ...UNCOVERED]
    expect(named.filter((id) => !known.has(id))).toEqual([])
  })

  it('gives a known status to every version that is expected to fail something', () => {
    for (const row of ROWS.filter((r) => r.cases.length > 0)) {
      expect({ version: row.version, status: row.status }).toEqual({
        version: row.version,
        status: expect.stringMatching(/^(failed|timed_out)$/),
      })
    }
  })

  it('says slow-balance fails exactly the balance read and the cases that declare writes', () => {
    const slow = ROWS.find((row) => row.version === 'slow-balance')!
    const declared = ['member/balance', ...CASES.filter((c) => c.writes).map((c) => c.id)]
    expect([...slow.cases].sort()).toEqual([...declared].sort())
  })
})

describe('every case against every version', () => {
  // Concurrent: each version runs its cases one after another on fresh tenants,
  // and the versions do not touch one another.
  it.concurrent.each(ROWS.map((row) => [row.version, row] as const))(
    '%s: the cases that go red are the ones the table says, with the status it says',
    async (_, row) => {
      const results = await runAll(row.version)
      const expected = new Set(row.cases)

      const problems = [
        ...CASES.map((c) => c.id)
          .filter((id) => results[id] !== 'passed' && !expected.has(id))
          .map(
            (id) =>
              `${id} was ${results[id]}, and the table does not expect ${row.version} to fail it`,
          ),
        ...[...expected]
          .filter((id) => results[id] === 'passed')
          .map((id) => `${id} passed, and the table expects ${row.version} to fail it`),
        ...[...expected]
          .filter((id) => results[id] !== 'passed' && results[id] !== row.status)
          .map((id) => `${id} was ${results[id]}, and the table expects ${row.status}`),
      ]
      // Thrown as text rather than compared as objects: a failure has to say
      // which case and which version, not "expected { …(3) }".
      if (problems.length > 0) throw new Error(`\n  ${problems.join('\n  ')}`)
    },
    60_000,
  )

  it('has a version that makes each case fail, or says why not', () => {
    const covered = new Set(
      ROWS.filter((row) => row.status === 'failed').flatMap((row) => row.cases),
    )
    const all = CASES.map((c) => c.id)
    const problems = [
      ...all
        .filter((id) => !covered.has(id) && !UNCOVERED.includes(id))
        .map((id) => `${id} is made to fail by no version, and is not listed as uncovered`),
      ...UNCOVERED.filter((id) => covered.has(id)).map(
        (id) => `${id} is listed as uncovered, but a version makes it fail`,
      ),
    ]
    if (problems.length > 0) throw new Error(`\n  ${problems.join('\n  ')}`)
  })
})
