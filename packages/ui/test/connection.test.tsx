import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Connection } from '../src/components/Connection'
import { NOW, session } from './fixtures'

type Props = Parameters<typeof Connection>[0]

const render = (overrides: Partial<Props> = {}) =>
  renderToStaticMarkup(
    <Connection
      session={session()}
      version="correct"
      onVersion={() => {}}
      secret={null}
      secretProblem={null}
      onReveal={() => {}}
      revealing={false}
      onRefresh={() => {}}
      onContinue={() => {}}
      refreshing={false}
      now={NOW}
      {...overrides}
    />,
  )

describe('the Connection page', () => {
  it('shows the address of the chosen version, and changes with it', () => {
    expect(render()).toContain('https://partner.example/correct/t-1')
    const other = render({ version: 'off-by-one' })
    expect(other).toContain('https://partner.example/off-by-one/t-1')
    expect(other).not.toContain('/correct/t-1')
  })

  it('offers every version', () => {
    const html = render()
    expect(html).toContain('>correct</option>')
    expect(html).toContain('>off-by-one</option>')
  })

  it('leads on to the Run page with one primary button', () => {
    const html = render()
    expect(html).toContain('>Continue to Run</button>')
    expect(html.match(/class="primary"/g)).toHaveLength(1)
  })

  it('says how long the session has left', () => {
    expect(render()).toContain('24 h 0 min')
  })

  it('lists the members with their balances, grouped', () => {
    const html = render()
    expect(html).toContain('mbr_a')
    expect(html).toContain('1,000')
    expect(html).toContain('1,100')
  })

  it('says a balance is not available rather than showing 0 or nothing', () => {
    const html = render({
      session: session({ members: [{ slot: 'A', id: 'mbr_a', balance: null }] }),
    })
    expect(html).toContain('not available')
    expect(html).not.toMatch(/>0</)
  })

  describe('the signing secret', () => {
    it('is not on the page before it is shown, and there is a button to show it', () => {
      const html = render()
      expect(html).not.toContain('whsec_')
      expect(html).toContain('Show the secret once')
    })

    it('shows it when this page has been given it, with the warning, and no button', () => {
      const html = render({
        secret: 'whsec_abc123',
        session: session({ secret: { revealed: true } }),
      })
      expect(html).toContain('whsec_abc123')
      expect(html).toContain('only time it is shown')
      expect(html).not.toContain('Show the secret once')
    })

    it('does not offer it again when it was shown earlier, and does not have it', () => {
      const html = render({ session: session({ secret: { revealed: true } }) })
      expect(html).toContain('has been shown once')
      expect(html).not.toContain('Show the secret once')
      expect(html).not.toContain('whsec_')
    })

    it('disables the button while it is being asked for', () => {
      expect(render({ revealing: true })).toMatch(/<button[^>]*disabled[^>]*>Showing…/)
    })

    it('shows why asking failed, as an alert', () => {
      expect(render({ secretProblem: 'The reference partner did not answer.' })).toContain(
        'role="alert"',
      )
    })
  })

  /**
   * Nothing the page shows is taken as markup. Member ids and addresses come
   * from the API today, and from a partner's answers on the pages to come; the
   * page treats all of it as text.
   */
  it('renders what the API sent as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const html = render({
      session: session({
        members: [{ slot: 'A', id: hostile, balance: 1 }],
        partner: {
          tenant: hostile,
          versions: ['correct'],
          baseUrls: { correct: hostile },
        },
      }),
      secret: hostile,
      secretProblem: hostile,
    })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})
