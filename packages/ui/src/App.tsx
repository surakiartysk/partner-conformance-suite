import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, createClient, type SessionView } from './api'
import { Connection } from './components/Connection'
import { Home } from './components/Home'
import { Layout } from './components/Layout'
import { RunPage } from './components/RunPage'
import { messageFor } from './messages'
import { parseRoute, pathFor, type Route } from './route'

type Known = Exclude<Route, { page: 'not-found' }>

const problemOf = (error: unknown) =>
  error instanceof ApiError ? messageFor(error.failure, error.retryAfter) : messageFor('unexpected')

export function App() {
  const client = useMemo(() => createClient(), [])
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const [session, setSession] = useState<SessionView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const [starting, setStarting] = useState(false)
  const [startProblem, setStartProblem] = useState<string | null>(null)

  const [version, setVersion] = useState('correct')
  const [secret, setSecret] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [secretProblem, setSecretProblem] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // The time left on a session is read from the clock, so the clock is a state.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let current = true
    client
      .getSession()
      .then((found) => current && setSession(found))
      .catch(() => current && setSession(null))
      .finally(() => current && setLoaded(true))
    return () => {
      current = false
    }
  }, [client])

  const navigate = useCallback((to: Known) => {
    window.history.pushState(null, '', pathFor(to))
    setRoute(to)
    window.scrollTo(0, 0)
  }, [])

  const start = async () => {
    setStarting(true)
    setStartProblem(null)
    try {
      const started = await client.startSession()
      // Starting does not report balances; reading the session does. Without
      // this the first look at the members says "not available" for balances
      // that are 1,000.
      setSession((await client.getSession().catch(() => null)) ?? started)
      setSecret(null)
      setSecretProblem(null)
      navigate({ page: 'connection' })
    } catch (error) {
      setStartProblem(problemOf(error))
    } finally {
      setStarting(false)
    }
  }

  const reveal = async () => {
    setRevealing(true)
    setSecretProblem(null)
    try {
      setSecret(await client.revealSecret())
      setSession((s) => (s ? { ...s, secret: { revealed: true } } : s))
    } catch (error) {
      setSecretProblem(problemOf(error))
    } finally {
      setRevealing(false)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      const fresh = await client.getSession()
      setSession(fresh)
      if (!fresh) setSecretProblem(messageFor('no-session'))
    } catch (error) {
      setSecretProblem(problemOf(error))
    } finally {
      setRefreshing(false)
    }
  }

  let page
  if (!loaded) {
    page = <p className="note">Loading…</p>
  } else if (route.page === 'home') {
    page = (
      <Home
        session={session}
        starting={starting}
        problem={startProblem}
        onStart={start}
        onNavigate={navigate}
        now={now}
      />
    )
  } else if (route.page === 'connection') {
    page = session ? (
      <Connection
        session={session}
        version={version}
        onVersion={setVersion}
        secret={secret}
        secretProblem={secretProblem}
        onReveal={reveal}
        revealing={revealing}
        onRefresh={refresh}
        onContinue={() => navigate({ page: 'run' })}
        refreshing={refreshing}
        now={now}
      />
    ) : (
      <>
        <h1>Connection</h1>
        <p>{messageFor('no-session')}</p>
      </>
    )
  } else if (route.page === 'run') {
    page = session ? (
      <RunPage client={client} session={session} />
    ) : (
      <>
        <h1>Run</h1>
        <p>{messageFor('no-session')}</p>
      </>
    )
  } else {
    page = (
      <>
        <h1>Not found</h1>
        <p>There is no such page.</p>
      </>
    )
  }

  return (
    <Layout route={route} hasSession={session !== null} onNavigate={navigate}>
      {page}
    </Layout>
  )
}
