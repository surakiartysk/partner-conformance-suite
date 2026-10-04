import type { Step } from '../define'
import { defineCase } from '../define'
import { balanceUnchanged, problem, transactionId } from './steps'

const earn100: Step = {
  name: 'earned',
  request: (ctx) => ({
    method: 'POST',
    path: '/points/earn',
    body: { memberId: ctx.member.id, points: 100, reference: ctx.ref('earn') },
  }),
}

export const reversal = [
  defineCase({
    id: 'reversal/undoes-earn',
    service: 'reversal',
    name: 'Reversing an earn takes its points back',
    description: 'After an earn of 100 and its reversal, the balance is where it started.',
    member: 'B',
    writes: true,
    arrange: [earn100],
    act: {
      name: 'reverse',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/reversals',
        body: { transactionId: transactionId(ctx, 'earned'), reference: ctx.ref('reverse') },
      }),
      expect: (ctx) => ({
        status: 200,
        body: {
          type: 'reversal',
          reverses: transactionId(ctx, 'earned'),
          points: 100,
          balance: ctx.start.unchanged(),
        },
      }),
    },
    verify: [balanceUnchanged],
  }),

  defineCase({
    id: 'reversal/twice',
    service: 'reversal',
    name: 'A transaction can be reversed only once',
    description:
      'A second reversal of the same earn, under a new reference, is a 409 already-reversed — and moves nothing.',
    member: 'B',
    writes: true,
    arrange: [
      earn100,
      {
        name: 'reversed',
        request: (ctx) => ({
          method: 'POST',
          path: '/points/reversals',
          body: { transactionId: transactionId(ctx, 'earned'), reference: ctx.ref('first') },
        }),
      },
    ],
    act: {
      name: 'reverse again',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/reversals',
        body: { transactionId: transactionId(ctx, 'earned'), reference: ctx.ref('second') },
      }),
      expect: () => problem(409, 'already-reversed'),
    },
    verify: [balanceUnchanged],
  }),

  defineCase({
    id: 'reversal/unknown-transaction',
    service: 'reversal',
    name: 'Reversing a transaction that does not exist is a 404',
    description: 'An RFC 9457 problem document of type transaction-not-found.',
    member: 'B',
    writes: false,
    act: {
      name: 'reverse',
      request: (ctx) => ({
        method: 'POST',
        path: '/points/reversals',
        body: { transactionId: ctx.unknownId('txn_'), reference: ctx.ref() },
      }),
      expect: () => problem(404, 'transaction-not-found'),
    },
  }),
]
