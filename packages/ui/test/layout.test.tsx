import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Layout, titleFor } from '../src/components/Layout'
import type { Route } from '../src/route'

const render = (route: Route, hasSession = true) =>
  renderToStaticMarkup(
    <Layout route={route} hasSession={hasSession} onNavigate={() => {}}>
      <p>page</p>
    </Layout>,
  )

const current = (html: string) =>
  [...html.matchAll(/<a href="([^"]*)" class="nav-link current">/g)].map((m) => m[1])

describe('the page chrome', () => {
  it('marks the page you are on as the current one, and only that one', () => {
    expect(current(render({ page: 'connection' }))).toEqual(['/connection'])
    expect(current(render({ page: 'run' }))).toEqual(['/run'])
    expect(current(render({ page: 'history' }))).toEqual(['/history'])
    expect(current(render({ page: 'home' }))).toEqual(['/'])
  })

  it('keeps Run as the current page while a result of a run is open', () => {
    expect(current(render({ page: 'result', runId: 'run_1' }))).toEqual(['/run'])
    expect(current(render({ page: 'result', runId: 'run_1', caseId: 'earn/adds-points' }))).toEqual(
      ['/run'],
    )
  })

  it('marks none on a page that is not one of them', () => {
    expect(current(render({ page: 'not-found' }))).toEqual([])
  })

  it('offers Connection and Run only with a session', () => {
    const without = render({ page: 'home' }, false)
    expect(without).not.toContain('href="/connection"')
    expect(without).not.toContain('href="/run"')
    expect(without).not.toContain('href="/history"')
    const withSession = render({ page: 'home' }, true)
    expect(withSession).toContain('href="/connection"')
    expect(withSession).toContain('href="/run"')
    expect(withSession).toContain('href="/history"')
  })
})

describe('the demo notice and the page that explains it', () => {
  it('says on every page that this tests a built-in sample, with a link to how it works', () => {
    for (const route of [{ page: 'home' }, { page: 'run' }, { page: 'history' }] as Route[]) {
      const html = render(route)
      expect(html).toContain('Demo: this site tests a built-in sample partner, not your API.')
      expect(html).toMatch(/<a href="\/how-it-works">How it works<\/a><\/p>/)
    }
  })

  it('links How it works from the header with no session, like Home and unlike the rest', () => {
    const html = render({ page: 'home' }, false)
    expect(html).toContain('<a href="/how-it-works" class="nav-link">How it works</a>')
    expect(html).not.toContain('href="/run" class="nav-link')
  })

  it('marks it as the current page when it is the page', () => {
    expect(current(render({ page: 'how-it-works' }))).toEqual(['/how-it-works'])
  })

  it('links For partners from the header with no session, marks it when it is the page, and names it in the title', () => {
    expect(render({ page: 'home' }, false)).toContain(
      '<a href="/for-partners" class="nav-link">For partners</a>',
    )
    expect(current(render({ page: 'for-partners' }))).toEqual(['/for-partners'])
    expect(titleFor({ page: 'for-partners' })).toBe('For partners · Partner conformance suite')
  })
})
