// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Layout, titleFor } from '../src/components/Layout'
import type { Route } from '../src/route'

afterEach(cleanup)

const page = (route: Route, heading = true) => (
  <Layout route={route} hasSession onNavigate={() => {}}>
    {heading ? <h1>Heading</h1> : <p>no heading yet</p>}
  </Layout>
)

describe('the title of a page', () => {
  it('names the page first and the site after it, and the home page is the site', () => {
    expect(titleFor({ page: 'home' })).toBe('Partner conformance suite')
    expect(titleFor({ page: 'connection' })).toBe('Connection · Partner conformance suite')
    expect(titleFor({ page: 'run' })).toBe('Run · Partner conformance suite')
    expect(titleFor({ page: 'history' })).toBe('History · Partner conformance suite')
    expect(titleFor({ page: 'result', runId: 'run_1' })).toBe('Result · Partner conformance suite')
    expect(titleFor({ page: 'not-found' })).toBe('Not found · Partner conformance suite')
  })

  it('is set when the page is drawn, and changes with the page', () => {
    const { rerender } = render(page({ page: 'run' }))
    expect(document.title).toBe('Run · Partner conformance suite')
    rerender(page({ page: 'history' }))
    expect(document.title).toBe('History · Partner conformance suite')
  })
})

describe('where the focus goes', () => {
  it('stays where the browser put it on the first page', () => {
    render(page({ page: 'run' }))
    expect(document.activeElement).toBe(document.body)
  })

  it('goes to the heading of the next page, so a reader is told where they are', () => {
    const { rerender } = render(page({ page: 'run' }))
    rerender(page({ page: 'history' }))
    expect(document.activeElement?.tagName).toBe('H1')
    expect(document.activeElement?.textContent).toBe('Heading')
  })

  it('goes to the page itself while it has no heading yet', () => {
    const { rerender } = render(page({ page: 'run' }))
    rerender(page({ page: 'result', runId: 'run_1' }, false))
    expect(document.activeElement?.tagName).toBe('MAIN')
  })

  it('moves again for another result of the same kind of page, but not for a redraw of the same one', () => {
    const { rerender } = render(page({ page: 'result', runId: 'run_1' }))
    ;(document.activeElement as HTMLElement | null)?.blur()
    rerender(page({ page: 'result', runId: 'run_1' }))
    expect(document.activeElement).toBe(document.body)
    rerender(page({ page: 'result', runId: 'run_2' }))
    expect(document.activeElement?.tagName).toBe('H1')
  })
})
