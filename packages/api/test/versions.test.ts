import { CASES } from '@conformance/cases'
import { describe, expect, it } from 'vitest'
import table from '../../../docs/variants.md?raw'
import { PARTNER_VERSIONS } from '../src/partner'
import { VERSIONS } from '../src/versions'
import { callApi } from './helpers'

/**
 * The page tells a visitor what was wrong with a version once a run is over. It
 * must not say anything docs/variants.md does not, so this reads that table and
 * holds the served data to it, name by name and word by word.
 */
const ids = (cell: string) => [...cell.matchAll(/`([a-z]+\/[a-z-]+)`/g)].map((m) => m[1]!)

function parseTable() {
  const start = table.indexOf('## What each version does wrong')
  const end = table.indexOf('\n## ', start + 10)
  return table
    .slice(start, end)
    .split('\n')
    .filter((line) => /^\| `/.test(line))
    .map((line) => {
      const [, name, bug, status, cases] = line.split('|').map((c) => c.trim())
      return {
        name: name!.replaceAll('`', ''),
        bug: bug!.replaceAll('`', ''),
        status: status === '—' ? null : status!.replaceAll('`', ''),
        catches: ids(cases!),
      }
    })
}

const DOC = parseTable()

describe('the version data', () => {
  it('names every version the partner serves, once, in the order the API lists them', () => {
    expect(VERSIONS.map((v) => v.name)).toEqual([...PARTNER_VERSIONS])
  })

  it('says what the document says for each version, in both directions', () => {
    for (const version of VERSIONS) {
      const row = DOC.find((r) => r.name === version.name)
      expect(row, version.name).toBeDefined()
      expect({
        name: version.name,
        bug: version.bug ?? 'none',
        status: version.status,
        catches: version.catches,
      }).toEqual({
        name: row!.name,
        bug: row!.bug,
        status: row!.status,
        catches: row!.catches,
      })
    }
    expect(DOC.map((r) => r.name).sort()).toEqual(VERSIONS.map((v) => v.name).sort())
  })

  it('names only cases that exist', () => {
    const known = new Set(CASES.map((c) => c.id))
    expect(VERSIONS.flatMap((v) => v.catches).filter((id) => !known.has(id))).toEqual([])
  })

  it('has a status for exactly the versions that must fail something', () => {
    for (const v of VERSIONS) {
      expect(v.status !== null, v.name).toBe(v.catches.length > 0)
      expect(v.bug !== null, v.name).toBe(v.catches.length > 0)
    }
  })
})

describe('GET /api/versions', () => {
  it('serves the data without needing a session', async () => {
    const response = await callApi('/versions')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(VERSIONS)))
  })

  it('carries the same security headers as every other answer', async () => {
    const response = await callApi('/versions')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
