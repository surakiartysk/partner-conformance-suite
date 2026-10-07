import { app } from './app'
import { purge } from './purge'
import type { Bindings } from './types'

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(purge(env.DB, Math.floor(Date.now() / 1000)))
  },
} satisfies ExportedHandler<Bindings>
