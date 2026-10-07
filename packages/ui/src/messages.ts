import type { Failure } from './api'

/**
 * What the page says when a call fails.
 *
 * Chosen here from the kind of failure, never taken from the server's own
 * text: the page's words are its own, and an error body is not shown as if it
 * were one.
 */
export function messageFor(failure: Failure, retryAfterSeconds?: number): string {
  switch (failure) {
    case 'no-session':
      return 'There is no session, or it has ended. Start a new one.'
    case 'rate-limited':
      return retryAfterSeconds
        ? `Too many sessions have been started from this address. Try again in ${Math.ceil(retryAfterSeconds / 60)} min.`
        : 'Too many sessions have been started from this address. Try again later.'
    case 'not-configured':
      return 'This deployment is not set up to start sessions yet.'
    case 'already-shown':
      return 'The signing secret has already been shown once. Start a new session to see another.'
    case 'unavailable':
      return 'The reference partner did not answer. Try again in a moment.'
    case 'network':
      return 'The server could not be reached. Check the connection and try again.'
    case 'unexpected':
      return 'The server answered with something this page does not understand.'
  }
}
