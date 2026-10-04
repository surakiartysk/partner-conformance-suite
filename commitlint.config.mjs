/**
 * Conventional Commits, with the scopes this repo actually uses.
 *
 * `scope-enum` is closed on purpose: an open list drifts into near-synonyms
 * within a month. Adding a scope should be a decision, so it is an edit here.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // packages
        'spec',
        'partner',
        'cases',
        'api',
        'ui',
        // cross-cutting
        'signing',
        'db',
        'core',
        'ci',
        'deps',
      ],
    ],
    // The body carries the reasoning in this repo, so it gets room.
    'body-max-line-length': [2, 'always', 100],
  },
}
