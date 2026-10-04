import { defineCase } from '../define'
import { any } from '../matchers'
import { balanceIs, balanceUnchanged, problem, transactionId } from './steps'

export const earn = [
  defineCase({
    id: 'earn/adds-points',
    service: 'earn',
    name: 'Earning adds exactly the points earned',
    description: 'Earning 100 points raises the balance by 100, and the response says so.',
    member: 'A',
    writes: true,
    act: {
      name: 'earn',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/earn',
        body: { memberId: ctx.member.id, points: 100, reference: ctx.ref() },
      }),
      expect: (ctx) => ({
        status: 200,
        body: {
          transactionId: any.string(),
          type: 'earn',
          memberId: ctx.member.id,
          points: 100,
          balance: ctx.start.plus(100),
        },
      }),
    },
    verify: [balanceIs((ctx) => ctx.start.plus(100))],
  }),

  defineCase({
    id: 'earn/duplicate-reference',
    service: 'earn',
    name: 'Earning twice with one reference adds the points once',
    description:
      'The same earn sent again — a retry after a timeout — returns the original transaction and adds nothing.',
    member: 'A',
    writes: true,
    arrange: [
      {
        name: 'first',
        request: (ctx) => ({
          method: 'POST',
          path: '/points/earn',
          body: { memberId: ctx.member.id, points: 100, reference: ctx.ref('earn') },
        }),
      },
    ],
    act: {
      name: 'repeat',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/earn',
        body: { memberId: ctx.member.id, points: 100, reference: ctx.ref('earn') },
      }),
      expect: (ctx) => ({
        status: 200,
        body: { transactionId: transactionId(ctx, 'first'), balance: ctx.start.plus(100) },
      }),
    },
    verify: [balanceIs((ctx) => ctx.start.plus(100))],
  }),

  defineCase({
    id: 'earn/invalid-points',
    service: 'earn',
    name: 'Earning zero points is refused',
    description: 'points must be at least 1. A 400 problem, and the balance does not move.',
    member: 'A',
    writes: true,
    act: {
      name: 'earn',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/earn',
        body: { memberId: ctx.member.id, points: 0, reference: ctx.ref() },
      }),
      expect: () => problem(400, 'invalid-request'),
    },
    verify: [balanceUnchanged],
  }),

  defineCase({
    id: 'earn/unknown-member',
    service: 'earn',
    name: 'Earning for an unknown member is a 404',
    description: 'A member the partner does not have cannot earn anything.',
    member: 'A',
    writes: false,
    act: {
      name: 'earn',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/earn',
        body: { memberId: ctx.unknownId('mbr_'), points: 10, reference: ctx.ref() },
      }),
      expect: () => problem(404, 'member-not-found'),
    },
  }),
]
