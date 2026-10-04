import { defineCase, type SigningFault, type Step } from '../define'
import { PROBLEM_JSON, UNAUTHENTICATED, problemType } from '../problems'
import { balanceUnchanged } from './steps'

const TOLERANCE_SECONDS = 5 * 60

/** Reading the member with a signing fault: the partner must answer 401. */
const refused = (fault: SigningFault): Step => ({
  name: 'request',
  request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}`, fault }),
  expect: () => ({ status: 401, headers: PROBLEM_JSON, body: { type: UNAUTHENTICATED } }),
})

export const security = [
  defineCase({
    id: 'security/valid-signature',
    service: 'security',
    name: 'A correctly signed request is accepted',
    description:
      'The control for the cases below: without it, a partner that refused everything would pass them all.',
    member: 'A',
    writes: false,
    act: {
      name: 'request',
      request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}` }),
      expect: (ctx) => ({ status: 200, body: { id: ctx.member.id } }),
    },
  }),

  defineCase({
    id: 'security/missing-signature',
    service: 'security',
    name: 'A request with no signature is refused',
    description: 'No webhook-signature header at all must be a 401, not a request served.',
    member: 'A',
    writes: false,
    act: refused({ omit: 'webhook-signature' }),
  }),

  defineCase({
    id: 'security/wrong-signature',
    service: 'security',
    name: 'A request signed with another secret is refused',
    description: "Signed correctly, but not with this partner's secret. Must be a 401.",
    member: 'A',
    writes: false,
    act: refused({ wrongSecret: true }),
  }),

  defineCase({
    id: 'security/stale-timestamp',
    service: 'security',
    name: 'A request signed six minutes ago is refused',
    description:
      'Correctly signed, with a timestamp a minute past the five-minute tolerance. Must be a 401.',
    member: 'A',
    writes: false,
    act: refused({ timestampOffset: -(TOLERANCE_SECONDS + 60) }),
  }),

  defineCase({
    id: 'security/tampered-body',
    service: 'security',
    name: 'A body changed after signing is refused, and moves nothing',
    description:
      'An earn of 10 points is signed, then changed to 900 in transit. The partner must refuse it and the balance must not move.',
    member: 'A',
    writes: true,
    act: {
      name: 'request',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/earn',
        body: { memberId: ctx.member.id, points: 10, reference: ctx.ref() },
        fault: { tamper: (body) => body.replace('"points":10', '"points":900') },
      }),
      expect: () => ({ status: 401, headers: PROBLEM_JSON, body: { type: UNAUTHENTICATED } }),
    },
    verify: [balanceUnchanged],
  }),

  defineCase({
    id: 'security/replayed-request',
    service: 'security',
    name: 'A request sent twice is refused the second time',
    description:
      'The same request, byte for byte — same webhook-id, same signature. The copy must be refused with 409.',
    member: 'A',
    writes: false,
    arrange: [
      {
        name: 'original',
        request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}` }),
      },
    ],
    act: {
      name: 'replay',
      request: () => ({ replayOf: 'original' }),
      expect: () => ({
        status: 409,
        headers: PROBLEM_JSON,
        body: { type: problemType('replayed-request') },
      }),
    },
  }),
]
