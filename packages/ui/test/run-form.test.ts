import { describe, expect, it } from 'vitest'
import type { CaseInfo } from '../src/api'
import {
  canSubmit,
  casesFor,
  defaultVersion,
  orderVersions,
  servicesOf,
  toggleService,
} from '../src/run-form'

const c = (id: string, service: string): CaseInfo => ({
  id,
  service,
  name: id,
  description: '',
  member: 'A',
  writes: false,
})
const cases = [c('s/1', 'security'), c('e/1', 'earn'), c('e/2', 'earn'), c('r/1', 'redeem')]

describe('services', () => {
  it('are the services the cases name, once each, in the order they first appear', () => {
    expect(servicesOf(cases)).toEqual(['security', 'earn', 'redeem'])
  })

  it('choose the cases a run would plan', () => {
    expect(casesFor(cases, ['earn']).map((x) => x.id)).toEqual(['e/1', 'e/2'])
    expect(casesFor(cases, ['earn', 'security']).map((x) => x.id)).toEqual(['s/1', 'e/1', 'e/2'])
    expect(casesFor(cases, [])).toEqual([])
  })

  it('toggle on and off, and stay in the cases order whatever order they were chosen in', () => {
    const all = ['security', 'earn', 'redeem']
    expect(toggleService(['earn'], all, 'security')).toEqual(['security', 'earn'])
    expect(toggleService(['security', 'earn'], all, 'security')).toEqual(['earn'])
    expect(toggleService(['earn'], all, 'earn')).toEqual([])
  })
})

describe('versions', () => {
  it('start on a wrong one, so a first run shows a red case', () => {
    expect(defaultVersion(['correct', 'double-earn', 'off-by-one'])).toBe('double-earn')
  })

  it('start on the first wrong one when the favourite is not offered', () => {
    expect(defaultVersion(['correct', 'off-by-one', 'overdraws'])).toBe('off-by-one')
  })

  it('start on what there is when there is only the right one, or nothing', () => {
    expect(defaultVersion(['correct'])).toBe('correct')
    expect(defaultVersion([])).toBe('correct')
  })

  it('are listed with correct first and the rest as the server gave them', () => {
    expect(orderVersions(['off-by-one', 'correct', 'overdraws'])).toEqual([
      'correct',
      'off-by-one',
      'overdraws',
    ])
  })
})

describe('canSubmit', () => {
  it('needs a service chosen and no run going', () => {
    expect(canSubmit(['earn'], false)).toBe(true)
    expect(canSubmit([], false)).toBe(false)
    expect(canSubmit(['earn'], true)).toBe(false)
    expect(canSubmit([], true)).toBe(false)
  })
})
