import { CASES } from '@conformance/cases'
import { describe, expect, it } from 'vitest'
import { callApi } from './helpers'

type Listed = {
  id: string
  service: string
  name: string
  description: string
  member: string
  writes: boolean
}

describe('GET /api/cases', () => {
  it('lists every case, in the order they are defined, without needing a session', async () => {
    const response = await callApi('/cases')
    expect(response.status).toBe(200)
    const listed = await response.json<Listed[]>()
    expect(listed.map((c) => c.id)).toEqual(CASES.map((c) => c.id))
  })

  it('says what each case is about', async () => {
    const listed = await (await callApi('/cases')).json<Listed[]>()
    const earn = listed.find((c) => c.id === 'earn/duplicate-reference')!
    expect(earn).toEqual({
      id: 'earn/duplicate-reference',
      service: 'earn',
      name: 'Earning twice with one reference adds the points once',
      description:
        'The same earn sent again — a retry after a timeout — returns the original transaction and adds nothing.',
      member: 'A',
      writes: true,
    })
  })

  /**
   * The page is told what a case is, never how it is built. A request, an
   * expectation or a function would be a key this list does not have, or a
   * value that is not plain text or a flag.
   */
  it('publishes nothing about how a case is built', async () => {
    const listed = await (await callApi('/cases')).json<Record<string, unknown>[]>()
    expect(listed).toHaveLength(CASES.length)
    for (const entry of listed) {
      expect(Object.keys(entry).sort()).toEqual(
        ['description', 'id', 'member', 'name', 'service', 'writes'].sort(),
      )
      for (const [key, value] of Object.entries(entry)) {
        expect(['string', 'boolean'], key).toContain(typeof value)
      }
    }
  })

  it('carries the same security headers as every other answer', async () => {
    const response = await callApi('/cases')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
