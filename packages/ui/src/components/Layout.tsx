import type { ReactNode } from 'react'
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
] as const

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

export function Layout({ route, hasSession, onNavigate, children }: Props) {
  return (
    <>
      <header className="bar">
        <div className="bar-inner">
          <PageLink to={{ page: 'home' }} onNavigate={onNavigate} className="brand">
            Partner conformance suite
          </PageLink>
          <nav aria-label="Pages">
            {LINKS.filter((link) => link.page === 'home' || hasSession).map((link) => (
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
      <main className="page">{children}</main>
      <footer className="foot">
        The deployed suite only ever tests its own reference partner. It never takes an address from
        you.
      </footer>
    </>
  )
}
