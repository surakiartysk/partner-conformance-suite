import { describe, expect, it } from 'vitest'
import { parseRoute, pathFor } from '../src/route'

describe('routes', () => {
  it('reads each page the page has', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' })
    expect(parseRoute('/connection')).toEqual({ page: 'connection' })
    expect(parseRoute('/run')).toEqual({ page: 'run' })
    expect(parseRoute('/history')).toEqual({ page: 'history' })
    expect(parseRoute('/how-it-works')).toEqual({ page: 'how-it-works' })
    expect(parseRoute('/how-it-works/')).toEqual({ page: 'how-it-works' })
    expect(parseRoute('/for-partners')).toEqual({ page: 'for-partners' })
  })

  it('writes the address of the page that explains the site', () => {
    expect(pathFor({ page: 'how-it-works' })).toBe('/how-it-works')
    expect(pathFor({ page: 'for-partners' })).toBe('/for-partners')
  })

  it('reads the result of a run, and of one case of it', () => {
    expect(parseRoute('/runs/run_1b2c')).toEqual({ page: 'result', runId: 'run_1b2c' })
    expect(parseRoute('/runs/run_1b2c/')).toEqual({ page: 'result', runId: 'run_1b2c' })
    expect(parseRoute('/runs/run_1b2c/cases/earn/duplicate-reference')).toEqual({
      page: 'result',
      runId: 'run_1b2c',
      caseId: 'earn/duplicate-reference',
    })
  })

  it('does not read a result address that is not a run and a case', () => {
    for (const path of [
      '/runs',
      '/runs/',
      '/runs/run_1/cases',
      '/runs/run_1/cases/earn',
      '/runs/run_1/cases/earn/x/y',
      '/runs/run_1/cases/EARN/x',
      '/runs/run 1',
      '/runs/../session',
      '/runs/run_1/other',
    ]) {
      expect(parseRoute(path), path).toEqual({ page: 'not-found' })
    }
  })

  it('ignores a trailing slash', () => {
    expect(parseRoute('/connection/')).toEqual({ page: 'connection' })
    expect(parseRoute('')).toEqual({ page: 'home' })
  })

  it('says not-found for anything else, rather than showing a page', () => {
    for (const path of [
      '/nowhere',
      '/connection/x',
      '/api/session',
      '//connection',
      '/Connection',
    ]) {
      expect(parseRoute(path), path).toEqual({ page: 'not-found' })
    }
  })

  it('writes the path a route is read from', () => {
    for (const route of [
      { page: 'home' },
      { page: 'connection' },
      { page: 'run' },
      { page: 'history' },
      { page: 'result', runId: 'run_1' },
      { page: 'result', runId: 'run_1', caseId: 'earn/adds-points' },
    ] as const) {
      expect(parseRoute(pathFor(route))).toEqual(route)
    }
  })
})
