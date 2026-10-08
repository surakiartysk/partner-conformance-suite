import type { Progress } from './progress'
import { pointsGivenBack } from './progress'

const TEXT = {
  all: 'Points given back. Both members are at their starting balances.',
  'not-all':
    'Some points could not be given back yet. They are written down, and a later run or the sweep every ten minutes will give them back.',
  unknown:
    'A lane stopped before it could give its points back. They are written down, and a later run or the sweep every ten minutes will give them back.',
  'none-moved': 'No points moved.',
} as const

/** What to tell the visitor about their members' points, never claiming more than the lanes reported. */
export const givenBackText = (progress: Progress) => TEXT[pointsGivenBack(progress)]
