import { Hono } from 'hono'
import { createRun, getRun, listRuns, next } from './runs'
import { getSession, requireSession, revealSecret, startSession } from './sessions'
import type { Env } from './types'

export const app = new Hono<Env>()

app.post('/sessions', startSession)
app.get('/session', requireSession, getSession)
app.post('/session/secret', requireSession, revealSecret)

app.post('/runs', requireSession, createRun)
app.get('/runs', requireSession, listRuns)
app.get('/runs/:id', requireSession, getRun)
app.post('/runs/:id/lanes/:lane/next', requireSession, next)

app.notFound((c) => c.json({ error: 'not found' }, 404))
