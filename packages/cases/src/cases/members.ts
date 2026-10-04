import { defineCase } from '../define'
import { any, oneOf } from '../matchers'
import { problem } from './steps'

export const members = [
  defineCase({
    id: 'member/known',
    service: 'member',
    name: 'A member is returned in the shape the spec gives',
    description: 'id, a name, and a tier from the three the spec allows.',
    member: 'A',
    writes: false,
    act: {
      name: 'request',
      request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}` }),
      expect: (ctx) => ({
        status: 200,
        body: { id: ctx.member.id, name: any.string(), tier: oneOf('standard', 'silver', 'gold') },
      }),
    },
  }),

  defineCase({
    id: 'member/unknown',
    service: 'member',
    name: 'An unknown member is a 404 problem',
    description: 'An RFC 9457 problem document of type member-not-found.',
    member: 'A',
    writes: false,
    act: {
      name: 'request',
      request: (ctx) => ({ method: 'GET', path: `/members/${ctx.unknownId('mbr_')}` }),
      expect: () => problem(404, 'member-not-found'),
    },
  }),

  defineCase({
    id: 'member/balance',
    service: 'member',
    name: "A member's balance is readable",
    description: 'Every case that moves points depends on reading this one first.',
    member: 'A',
    writes: false,
    act: {
      name: 'request',
      request: (ctx) => ({ method: 'GET', path: `/members/${ctx.member.id}/balance` }),
      expect: (ctx) => ({ status: 200, body: { memberId: ctx.member.id, balance: any.integer() } }),
    },
  }),
]
