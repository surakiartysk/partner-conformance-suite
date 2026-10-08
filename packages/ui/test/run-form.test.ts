import { describe, expect, it } from 'vitest'
import type { CaseInfo } from '../src/api'
import {
  canSubmit,
  chooseCases,
  defaultVersion,
  groupCases,
  groupState,
  orderVersions,
  toggleCase,
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

const ids = cases.map((x) => x.id)

describe('groups', () => {
  it('hold the cases of each service, services in the order they first appear', () => {
    expect(groupCases(cases).map((g) => [g.service, g.cases.map((x) => x.id)])).toEqual([
      ['security', ['s/1']],
      ['earn', ['e/1', 'e/2']],
      ['redeem', ['r/1']],
    ])
  })

  it('gather a service whose cases are not listed together', () => {
    const apart = [c('e/1', 'earn'), c('s/1', 'security'), c('e/2', 'earn')]
    expect(groupCases(apart).map((g) => g.cases.map((x) => x.id))).toEqual([
      ['e/1', 'e/2'],
      ['s/1'],
    ])
  })
})

describe('choosing cases', () => {
  it('toggles one case on and off, and keeps the list order whatever order they were chosen in', () => {
    expect(toggleCase(['r/1'], ids, 's/1')).toEqual(['s/1', 'r/1'])
    expect(toggleCase(['s/1', 'e/1'], ids, 's/1')).toEqual(['e/1'])
    expect(toggleCase(['e/1'], ids, 'e/1')).toEqual([])
  })

  it('turns a group on without touching the rest, and off the same way', () => {
    expect(chooseCases(['r/1'], ids, ['e/1', 'e/2'], true)).toEqual(['e/1', 'e/2', 'r/1'])
    expect(chooseCases(['e/1', 'r/1'], ids, ['e/1', 'e/2'], true)).toEqual(['e/1', 'e/2', 'r/1'])
    expect(chooseCases(['s/1', 'e/1', 'e/2'], ids, ['e/1', 'e/2'], false)).toEqual(['s/1'])
  })

  it('says whether a group is all chosen, some, or none', () => {
    expect(groupState(['e/1', 'e/2'], ['e/1', 'e/2'])).toBe('all')
    expect(groupState(['e/1'], ['e/1', 'e/2'])).toBe('some')
    expect(groupState(['s/1'], ['e/1', 'e/2'])).toBe('none')
    expect(groupState([], ['e/1'])).toBe('none')
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
  it('needs a case chosen and no run going', () => {
    expect(canSubmit(1, false)).toBe(true)
    expect(canSubmit(0, false)).toBe(false)
    expect(canSubmit(1, true)).toBe(false)
    expect(canSubmit(0, true)).toBe(false)
  })
})
