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
  it('names the suite and says what it is, once', () => {
    const html = render()
    expect(html).toContain('<h1>Partner conformance suite</h1>')
    expect(html).toContain('Does a partner implement an API correctly?')
  })

  it('offers to try it, as the one primary button, when there is no session', () => {
    const html = render()
    expect(html).toContain('>Try it →</button>')
    expect(html.match(/class="primary"/g)).toHaveLength(1)
    expect(html).not.toContain('Your session ends')
  })

  it('says there is no sign-up, and what a visitor gets', () => {
    const html = render()
    expect(html).toContain('No sign-up.')
    expect(html).toContain('24 hours')
    expect(html).toContain('1,000 points each')
  })

  it('has no sign-in: no password, no name, no input at all', () => {
    expect(render()).not.toMatch(/<input|type="password"|Password|Sign in/)
    expect(render({ session: session() })).not.toMatch(/<input|type="password"|Password|Sign in/)
  })

  it('says how long the session has left, and leads on to Run, when there is one', () => {
    const html = render({ session: session() })
    expect(html).toContain('Your session ends in 24 h 0 min')
    expect(html).toContain('>Continue to Run →</button>')
    expect(html.match(/class="primary"/g)).toHaveLength(1)
    expect(html).not.toContain('>Try it')
  })

  it('still offers the connection, and lets a visitor start another session, saying what that does', () => {
    const html = render({ session: session() })
    expect(html).toContain('href="/connection"')
    expect(html).toContain('Start a new session instead')
    expect(html).toContain('replaces this one')
  })

  it('disables the button while a session is being started', () => {
    expect(render({ starting: true })).toMatch(/<button[^>]*disabled[^>]*>Starting…/)
    expect(render({ starting: true, session: session() })).toMatch(
      /<button[^>]*disabled[^>]*>Starting…/,
    )
  })

  it('shows why starting failed, as an alert, in either state', () => {
    for (const s of [null, session()]) {
      const html = render({ problem: 'Too many sessions.', session: s })
      expect(html).toMatch(/role="alert"[^>]*>Too many sessions\./)
    }
  })

  it('says plainly that only the reference partner can be tested', () => {
    expect(render()).not.toMatch(/enter|your own (URL|endpoint)/i)
  })

  it('draws its mark as a graphic that a screen reader skips', () => {
    expect(render()).toMatch(/<div class="mark" aria-hidden="true"><svg/)
  })
})
