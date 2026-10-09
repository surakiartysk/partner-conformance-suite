import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The partner API's specification, served from the page's own origin as `/openapi.yaml`: the How it
 * works page links to it, and it is the one source (packages/spec), not a copy kept beside the page.
 */
const spec = (): Plugin => ({
  name: 'partner-spec',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'openapi.yaml',
      source: readFileSync(new URL('../spec/openapi.yaml', import.meta.url), 'utf8'),
    })
  },
})

/**
 * Development goes through a proxy so the session cookie behaves as it will in
 * production. Vite serves the page on 5173 and the API Worker answers on 8787;
 * calling the Worker straight from the page would make every request
 * cross-origin, and the cookie would need `SameSite=None` to survive — a
 * production-shaped weakening made for a local inconvenience (decision 27).
 *
 * Everything the Worker answers is under `/api`, so one entry is enough. A
 * route that is missing there is not an error Vite reports: it falls through to
 * the page and the fetch gets HTML with a 200.
 */
export default defineConfig({
  plugins: [react(), spec()],
  build: {
    // Nothing is inlined as a data: URI. The page's policy lets fonts come from its
    // own origin only, and the fonts' small subsets were being inlined and refused.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
