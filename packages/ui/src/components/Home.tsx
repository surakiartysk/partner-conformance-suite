import type { SessionView } from '../api'
import { timeLeft } from '../format'
import { PageLink } from './Layout'
import type { Route } from '../route'

interface Props {
  session: SessionView | null
  starting: boolean
  problem: string | null
  onStart: () => void
  onNavigate: (to: Exclude<Route, { page: 'not-found' }>) => void
  now: number
}

export function Home({ session, starting, problem, onStart, onNavigate, now }: Props) {
  return (
    <>
      <h1>Does a partner implement the API correctly?</h1>
      <p className="lede">
        A provider publishes an API and partners implement it. This is how the provider checks: it
        sends signed requests to the partner, compares each answer with what the specification
        requires, and gives a verdict for every case.
      </p>

      <section aria-labelledby="try">
        <h2 id="try">Try it</h2>
        <p>
          You get a reference partner of your own for 24 hours, with two test members of 1,000
          points each. Later you will be able to run the cases against versions of it that are each
          wrong in one way, and see which case catches which mistake.
        </p>
        {session ? (
          <>
            <p>
              You already have a session, which ends in {timeLeft(session.expiresAt, now)}.{' '}
              <PageLink to={{ page: 'connection' }} onNavigate={onNavigate}>
                Go to the connection
              </PageLink>
              .
            </p>
            <button type="button" onClick={onStart} disabled={starting}>
              {starting ? 'Starting…' : 'Start a new session instead'}
            </button>
            <p className="note">
              The new one replaces this one in this browser. The old one ends by itself, and every
              start counts against the limit for this address.
            </p>
          </>
        ) : (
          <button type="button" className="primary" onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Try it'}
          </button>
        )}
        {problem ? (
          <p role="alert" className="problem">
            {problem}
          </p>
        ) : null}
      </section>
    </>
  )
}
