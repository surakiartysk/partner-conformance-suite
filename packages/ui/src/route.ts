/**
 * Which page the address bar names.
 *
 * Plain paths and `history.pushState`, no router library: there are a handful
 * of pages and one way through them, and a library would be most of the
 * bundle. Every path the page answers is listed here, so an unknown one is a
 * page that says so rather than a blank.
 */

export type Route =
  | { page: 'home' }
  | { page: 'connection' }
  | { page: 'run' }
  | { page: 'history' }
  | { page: 'how-it-works' }
  | { page: 'result'; runId: string; caseId?: string }
  | { page: 'not-found' }

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { page: 'home' }
  if (path === '/connection') return { page: 'connection' }
  if (path === '/run') return { page: 'run' }
  if (path === '/history') return { page: 'history' }
  if (path === '/how-it-works') return { page: 'how-it-works' }
  // /runs/<id>, or /runs/<id>/cases/<service>/<name> for one case of it.
  const result = /^\/runs\/([A-Za-z0-9_-]+)(?:\/cases\/([a-z]+\/[a-z-]+))?$/.exec(path)
  if (result) return { page: 'result', runId: result[1]!, caseId: result[2] }
  return { page: 'not-found' }
}

export function pathFor(route: Exclude<Route, { page: 'not-found' }>): string {
  if (route.page === 'result') {
    return route.caseId ? `/runs/${route.runId}/cases/${route.caseId}` : `/runs/${route.runId}`
  }
  return route.page === 'home' ? '/' : `/${route.page}`
}
