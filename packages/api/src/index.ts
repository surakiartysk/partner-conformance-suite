import { app } from './app'
import { sweep } from './sweeper'
import type { Bindings } from './types'

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(sweep(env))
  },
} satisfies ExportedHandler<Bindings>
