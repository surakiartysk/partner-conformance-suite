import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import spec from '../../spec/openapi.yaml?raw'
import { app } from '../src/app'
import { PROBLEMS } from '../src/problems'

/**
 * The reference partner and the spec it implements, held in step.
 *
 * Both directions matter. A route the spec lists and the partner lacks is a
 * case the suite can never pass; a route the partner serves and the spec does
 * not list is behaviour nobody promised and no case will ever check.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** Routes in the reference partner's own prefix, and so outside the spec. */
const PARTNER_ONLY_PROBLEMS = new Set(['not-found', 'unknown-tenant'])

const document = parse(spec) as { paths: Record<string, Record<string, unknown>> }

const specified = Object.entries(document.paths)
  .flatMap(([path, item]) =>
    METHODS.filter((method) => method in item).map((method) => `${method.toUpperCase()} ${path}`),
  )
  .sort()

const served = app.routes
  .filter((route) => route.method !== 'ALL' && route.path.startsWith('/:variant/:tenant/'))
  .map((route) => {
    const path = route.path.replace('/:variant/:tenant', '').replace(/:(\w+)/g, '{$1}')
    return `${route.method} ${path}`
  })
  .sort()

describe('the reference partner against the spec', () => {
  it('serves exactly the operations the spec lists', () => {
    expect(specified.length).toBeGreaterThan(0)
    expect(served).toEqual(specified)
  })

  it('names every problem it can return in the spec', () => {
    const undocumented = Object.keys(PROBLEMS).filter(
      (slug) =>
        !PARTNER_ONLY_PROBLEMS.has(slug) &&
        !new RegExp(`\`${slug}\`|problems/${slug}\\b`).test(spec),
    )
    expect(undocumented).toEqual([])
  })
})
