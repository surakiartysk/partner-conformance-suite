import { defineCase } from '../define'
import { any } from '../matchers'
import { balanceIs, balanceUnchanged, problem, transactionId } from './steps'

export const redeem = [
  defineCase({
    id: 'redeem/takes-points',
    service: 'redeem',
    name: 'Redeeming takes exactly the points redeemed',
    description: 'Redeeming 100 points lowers the balance by 100, and the response says so.',
    member: 'B',
    writes: true,
    act: {
      name: 'redeem',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/redeem',
        body: { memberId: ctx.member.id, points: 100, reference: ctx.ref() },
      }),
      expect: (ctx) => ({
        status: 200,
        body: {
          transactionId: any.string(),
          type: 'redeem',
          memberId: ctx.member.id,
          points: 100,
          balance: ctx.start.minus(100),
        },
      }),
    },
    verify: [balanceIs((ctx) => ctx.start.minus(100))],
  }),

  defineCase({
    id: 'redeem/over-balance',
    service: 'redeem',
    name: 'Redeeming one point more than the balance is refused',
    description:
      'A 422 insufficient-points problem, and nothing taken — not even the part the balance could cover.',
    member: 'B',
    writes: true,
    act: {
      name: 'redeem',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/redeem',
        body: { memberId: ctx.member.id, points: ctx.start.value + 1, reference: ctx.ref() },
      }),
      expect: () => problem(422, 'insufficient-points'),
    },
    verify: [balanceUnchanged],
  }),

  defineCase({
    id: 'redeem/duplicate-reference',
    service: 'redeem',
    name: 'Redeeming twice with one reference takes the points once',
    description:
      'The same redemption sent again returns the original transaction and takes nothing.',
    member: 'B',
    writes: true,
    arrange: [
      {
        name: 'first',
        request: (ctx) => ({
          method: 'POST',
          path: '/points/redeem',
          body: { memberId: ctx.member.id, points: 100, reference: ctx.ref('redeem') },
        }),
      },
    ],
    act: {
      name: 'repeat',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/redeem',
        body: { memberId: ctx.member.id, points: 100, reference: ctx.ref('redeem') },
      }),
      expect: (ctx) => ({
        status: 200,
        body: { transactionId: transactionId(ctx, 'first'), balance: ctx.start.minus(100) },
      }),
    },
    verify: [balanceIs((ctx) => ctx.start.minus(100))],
  }),

  defineCase({
    id: 'redeem/negative-points',
    service: 'redeem',
    name: 'Redeeming a negative number of points is refused',
    description:
      'A negative redemption would be an earn by another name. A 400 problem, and the balance does not move.',
    member: 'B',
    writes: true,
    act: {
      name: 'redeem',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/redeem',
        body: { memberId: ctx.member.id, points: -5, reference: ctx.ref() },
      }),
      expect: () => problem(400, 'invalid-request'),
    },
    verify: [balanceUnchanged],
  }),
]
