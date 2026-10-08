import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Layout } from '../src/components/Layout'
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
