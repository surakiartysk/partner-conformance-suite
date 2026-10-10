import { useEffect, useRef, type ReactNode } from 'react'
import { pathFor, type Route } from '../route'

interface Props {
  route: Route
  hasSession: boolean
  onNavigate: (to: Exclude<Route, { page: 'not-found' }>) => void
  children: ReactNode
}

const LINKS = [
  { page: 'home', label: 'Home' },
  { page: 'connection', label: 'Connection' },
  { page: 'run', label: 'Run' },
  { page: 'history', label: 'History' },
  { page: 'how-it-works', label: 'How it works' },
  { page: 'for-partners', label: 'For partners' },
] as const

/** The pages that need no session, so they are linked before there is one. */
const OPEN = new Set<string>(['home', 'how-it-works', 'for-partners'])

/** A link that navigates in the page, and still works as a link when opened in a new tab. */
export function PageLink({
  to,
  onNavigate,
  children,
  className,
}: {
  to: Exclude<Route, { page: 'not-found' }>
  onNavigate: Props['onNavigate']
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={pathFor(to)}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        onNavigate(to)
      }}
    >
      {children}
    </a>
  )
}

const SITE = 'Partner conformance suite'

/** What the tab and a screen reader call the page: its name first, then the site's. */
export function titleFor(route: Route): string {
  switch (route.page) {
    case 'home':
      return SITE
    case 'connection':
      return `Connection · ${SITE}`
    case 'run':
      return `Run · ${SITE}`
    case 'history':
      return `History · ${SITE}`
    case 'how-it-works':
      return `How it works · ${SITE}`
    case 'for-partners':
      return `For partners · ${SITE}`
    case 'result':
      return `Result · ${SITE}`
    default:
      return `Not found · ${SITE}`
  }
}

export function Layout({ route, hasSession, onNavigate, children }: Props) {
  const main = useRef<HTMLElement | null>(null)
  const first = useRef(true)
  const where = JSON.stringify(route)

  useEffect(() => {
    document.title = titleFor(route)
    // The first page is the one the browser loaded and read out. Every later one
    // is drawn in place: nothing moves the reader there unless the page does, so the
    // focus goes to its heading, or to the page itself while there is none.
    if (first.current) {
      first.current = false
      return
    }
    const target = main.current?.querySelector('h1') ?? main.current
    if (target instanceof HTMLElement) {
      target.tabIndex = -1
      target.focus({ preventScroll: true })
    }
  }, [where])

  return (
    <>
      <div className="demo">
        <p>
          Demo: this site tests a built-in sample partner, not your API.{' '}
          <PageLink to={{ page: 'how-it-works' }} onNavigate={onNavigate}>
            How it works
          </PageLink>
        </p>
      </div>
      <header className="bar">
        <div className="bar-inner">
          <PageLink to={{ page: 'home' }} onNavigate={onNavigate} className="brand">
            Partner conformance suite
          </PageLink>
          <nav aria-label="Pages">
            {LINKS.filter((link) => OPEN.has(link.page) || hasSession).map((link) => (
              <PageLink
                key={link.page}
                to={{ page: link.page }}
                onNavigate={onNavigate}
                className={
                  route.page === link.page || (link.page === 'run' && route.page === 'result')
                    ? 'nav-link current'
                    : 'nav-link'
                }
              >
                {link.label}
              </PageLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="page" ref={main}>
        {children}
      </main>
      <footer className="foot">
        The deployed suite only ever tests its own reference partner. It never takes an address from
        you.
      </footer>
    </>
  )
}
