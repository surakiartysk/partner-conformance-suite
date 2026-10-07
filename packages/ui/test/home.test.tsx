import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Home } from '../src/components/Home'
import { NOW, session } from './fixtures'

type Props = Parameters<typeof Home>[0]

const render = (overrides: Partial<Props> = {}) =>
  renderToStaticMarkup(
    <Home
      session={null}
      starting={false}
      problem={null}
      onStart={() => {}}
      onNavigate={() => {}}
      now={NOW}
      {...overrides}
    />,
  )

describe('the Home page', () => {
  it('offers to try it when there is no session', () => {
    const html = render()
    expect(html).toContain('>Try it</button>')
    expect(html).not.toContain('already have a session')
  })

  it('says so, and offers the connection, when there is a session', () => {
    const html = render({ session: session() })
    expect(html).toContain('already have a session')
    expect(html).toContain('href="/connection"')
    expect(html).not.toContain('>Try it</button>')
  })

  it('still lets a visitor start another, and says what that does', () => {
    const html = render({ session: session() })
    expect(html).toContain('Start a new session instead')
    expect(html).toContain('replaces this one')
  })

  it('disables the button while a session is being started', () => {
    expect(render({ starting: true })).toMatch(/<button[^>]*disabled[^>]*>Starting…/)
  })

  it('shows why starting failed, as an alert', () => {
    const html = render({ problem: 'Too many sessions.' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Too many sessions.')
  })

  it('says plainly that only the reference partner can be tested', () => {
    expect(render()).not.toMatch(/enter|your own (URL|endpoint)/i)
  })
})
