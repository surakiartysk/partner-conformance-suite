import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
