import { Hono, type MiddlewareHandler } from 'hono'
import { listCases } from './case-list'
import { createRun, getRun, listRuns, next } from './runs'
import { getSession, requireSession, revealSecret, startSession } from './sessions'
import type { Env } from './types'
import { listVersions } from './versions'

/**
 * Everything the suite answers is under `/api`. The page the visitor uses is
 * served from the same origin (decision 27), and the two must not claim the
 * same paths.
 */
export const app = new Hono<Env>().basePath('/api')

/**
 * Every answer carries these, errors included.
 *
 * `nosniff` because some of what the API returns is text a partner wrote, and
 * a browser must not decide it is something else. `no-store` because the
 * answers belong to one session and must not sit in a shared cache. The page's
 * own headers are in packages/ui/public/_headers.
 */
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Cache-Control', 'no-store')
})

app.get('/cases', listCases)
app.get('/versions', listVersions)
/**
 * Starting a session is refused to other sites' pages.
 *
 * Every other write needs the session cookie, which `SameSite=Lax` keeps off
 * other sites' requests (decision 21). Starting one needs nothing, so any page
 * could POST here from its visitors' browsers and spend their five starts an
 * hour. A browser says where a request came from in `Sec-Fetch-Site`; one too
 * old to send it still sends `Origin` on a cross-site POST. A request with
 * neither is not from a browser page, and a script could send anything anyway.
 */
const fromThisSite: MiddlewareHandler<Env> = async (c, next) => {
  const site = c.req.header('sec-fetch-site')
  const origin = c.req.header('origin')
  const elsewhere =
    site === 'cross-site' ||
    site === 'same-site' ||
    (site === undefined && origin !== undefined && origin !== new URL(c.req.url).origin)
  if (elsewhere) return c.json({ error: 'start a session from this site' }, 403)
  await next()
}

app.post('/sessions', fromThisSite, startSession)
app.get('/session', requireSession, getSession)
app.post('/session/secret', requireSession, revealSecret)

app.post('/runs', requireSession, createRun)
app.get('/runs', requireSession, listRuns)
app.get('/runs/:id', requireSession, getRun)
app.post('/runs/:id/lanes/:lane/next', requireSession, next)

app.notFound((c) => c.json({ error: 'not found' }, 404))
