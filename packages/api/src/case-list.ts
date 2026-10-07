import { CASES } from '@conformance/cases'
import type { Context } from 'hono'

/**
 * What the page may know about a case: enough to name it in a lane and say what
 * it is about. Never how it is built — the requests, the expectations and the
 * way they are signed are the server's alone (decision 22). Fields are picked
 * one by one, so a field added to a case definition is not published by
 * accident.
 */
export function listCases(c: Context): Response {
  return c.json(
    CASES.map(({ id, service, name, description, member, writes }) => ({
      id,
      service,
      name,
      description,
      member,
      writes,
    })),
  )
}
