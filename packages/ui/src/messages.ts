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
    case 'run-limit':
      return retryAfterSeconds
        ? `This session has started too many runs. Try again in ${Math.ceil(retryAfterSeconds / 60)} min.`
        : 'This session has started too many runs. Try again later.'
    case 'member-busy':
      return 'Another run is using this member. The run waits and tries again.'
    case 'lane-busy':
      return 'This lane is already being run from another tab. The run waits and tries again.'
    case 'not-found':
      return 'The server has no such run. It may belong to a session that has ended.'
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
