import type { SessionView } from '../api'
import { timeLeft } from '../format'
import type { Route } from '../route'
import { PageLink } from './Layout'

interface Props {
  session: SessionView | null
  starting: boolean
  problem: string | null
  onStart: () => void
  onNavigate: (to: Exclude<Route, { page: 'not-found' }>) => void
  now: number
}

/**
 * The way in, as the dashboard's sign-in is: one card, one button. There is no
 * sign-in here (one role, nothing to protect; decision 21 and the rate limits
 * are what keep a session its own), so the button is the whole of it.
 */
export function Home({ session, starting, problem, onStart, onNavigate, now }: Props) {
  return (
    <div className="entry">
      <div className="mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
          <path
            d="M8 17l5 5 11-12"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1>Partner conformance suite</h1>
      <p className="lede">
        Does a partner implement an API correctly? Signed requests go in, and a verdict for every
        case comes out.
      </p>

      <div className="card entry-card">
        {session ? (
          <>
            <p className="note">Your session ends in {timeLeft(session.expiresAt, now)}.</p>
            <button type="button" className="primary" onClick={() => onNavigate({ page: 'run' })}>
              Continue to Run
            </button>
            <button type="button" onClick={onStart} disabled={starting}>
              {starting ? 'Starting…' : 'Start a new session instead'}
            </button>
            <p className="note">
              The new one replaces this one in this browser. The old one ends by itself, and every
              start counts against the limit for this address.{' '}
              <PageLink to={{ page: 'connection' }} onNavigate={onNavigate}>
                See the connection
              </PageLink>
              .
            </p>
          </>
        ) : (
          <>
            <button type="button" className="primary" onClick={onStart} disabled={starting}>
              {starting ? 'Starting…' : 'Try it'}
            </button>
            <p className="note">
              No sign-up. You get a reference partner of your own for 24 hours, with two test
              members of 1,000 points each. Versions of it are each wrong in one way, and the result
              says which case catches which mistake.
            </p>
          </>
        )}
        {problem ? (
          <p role="alert" className="problem">
            {problem}
          </p>
        ) : null}
      </div>
    </div>
  )
}
