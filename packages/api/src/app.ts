import { Hono } from 'hono'
import { createRun, getRun, listRuns, next } from './runs'
import { getSession, requireSession, revealSecret, startSession } from './sessions'
import type { Env } from './types'

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

app.post('/sessions', startSession)
app.get('/session', requireSession, getSession)
app.post('/session/secret', requireSession, revealSecret)

app.post('/runs', requireSession, createRun)
app.get('/runs', requireSession, listRuns)
app.get('/runs/:id', requireSession, getRun)
app.post('/runs/:id/lanes/:lane/next', requireSession, next)

app.notFound((c) => c.json({ error: 'not found' }, 404))
