import { describe, expect, it } from 'vitest'
import { parseRoute, pathFor } from '../src/route'

describe('routes', () => {
  it('reads each page the page has', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' })
    expect(parseRoute('/connection')).toEqual({ page: 'connection' })
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
    for (const route of [{ page: 'home' }, { page: 'connection' }] as const) {
      expect(parseRoute(pathFor(route))).toEqual(route)
    }
  })
})
