import type { SessionView } from '../src/api'

export function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    expiresAt: '2026-10-08T12:00:00.000Z',
    partner: {
      tenant: 't-1',
      versions: ['correct', 'off-by-one'],
      baseUrls: {
        correct: 'https://partner.example/correct/t-1',
        'off-by-one': 'https://partner.example/off-by-one/t-1',
      },
    },
    members: [
      { slot: 'A', id: 'mbr_a', balance: 1000 },
      { slot: 'B', id: 'mbr_b', balance: 1100 },
    ],
    secret: { revealed: false },
    ...overrides,
  }
}

export const NOW = Date.parse('2026-10-07T12:00:00Z')
