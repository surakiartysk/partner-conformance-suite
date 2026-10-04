import { Hono } from 'hono'
import { getSession, requireSession, revealSecret, startSession } from './sessions'
import type { Env } from './types'

export const app = new Hono<Env>()

app.post('/sessions', startSession)
app.get('/session', requireSession, getSession)
app.post('/session/secret', requireSession, revealSecret)

app.notFound((c) => c.json({ error: 'not found' }, 404))
