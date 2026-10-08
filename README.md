# partner-conformance-suite

A provider publishes an API; partners implement it. This suite is how the
provider checks that a partner's implementation is right — it sends signed
requests to the partner's endpoints, compares each response with what the spec
requires, and gives a verdict per case.

The idea is an industry one: conformance suites like this exist for OpenID
Connect and for Open Banking. The API here is invented, the standards it is
built on are not — see [decision 1](docs/decisions.md#1-the-contract-is-built-from-open-standards-and-carries-no-brand).

## Status

Built in stages. Done so far:

- **The contract** — [`packages/spec/openapi.yaml`](packages/spec/openapi.yaml):
  five operations on a member's points, Standard Webhooks signing, RFC 9457
  errors, idempotency by `reference`.
- **A reference partner** — [`packages/partner`](packages/partner): a correct
  implementation of that contract on Cloudflare Workers and D1, for the suite
  to run against.

- **The cases and their runner** — [`packages/cases`](packages/cases): twenty
  cases across five services, each saying what it expects as a value the
  result page can show. [`packages/api`](packages/api) signs each case's
  requests, sends them, and judges the answers. Every case passes against the
  reference partner.

- **Thirteen versions of the reference partner** — `correct` and twelve, each
  wrong in one way, with [`docs/variants.md`](docs/variants.md) saying exactly which
  cases each must make fail. The test that runs every case against every
  version reads that file, so it cannot drift from the code.

- **Sessions** — [`packages/api`](packages/api) is now a Worker: "try it"
  provisions a tenant on the reference partner, sets a session cookie, and
  keeps the session's signing secret encrypted.

- **Runs** — a run is three lanes the browser drives one case at a time, with
  each member held by one run at a time and every point a run moves written
  down before it moves, so it is always given back: by the run, by a later run,
  or by a sweep every ten minutes.

- **The page** — [`packages/ui`](packages/ui), served by the same Worker as
  the API: a home page that is one card and one button (no sign-in) and starts a session, a Connection page with the
  partner's address, the signing secret (shown once) and the test members'
  balances, a Run page (choose a version of the partner and the services, press
  Run, watch the three lanes), and the result of a run: the verdict, each case that
  did not pass with what did not match, the request that was sent and what came
  back beside what was expected, and what was wrong with the version. The history of
  runs is not built yet.

Next: the history of runs.

## Layout

```
packages/spec      the Points Partner API, linted with Redocly
packages/partner   the reference partner: Worker + D1
packages/cases     the cases, matchers and lanes
packages/api       the provider's side: signer, runner, and the Worker that also serves the page
packages/ui        the page: React and Vite
docs/architecture.md how the pieces fit, and what is not built yet
docs/decisions.md  what was chosen, why, and what it costs
docs/variants.md   what each wrong version must get wrong
docs/mutations.md  every test, shown to fail
```

## Running it

Node 22 and pnpm.

```bash
pnpm install
pnpm verify                  # format, lint (code and spec), types, leak check, tests, the page builds
pnpm db:migrate              # the local databases of both Workers
pnpm dev                     # the API, the reference partner and the built page on :8787
pnpm dev:ui                  # optional: the page with hot reload on :5173, proxying /api to :8787
```

`pnpm dev` serves whatever is in `packages/ui/dist`, so build the page first
(`pnpm build:ui`) or use `pnpm dev:ui` beside it. Secrets have no defaults, on
purpose: put `PROVISION_TOKEN` and `SECRET_KEY` (32 random bytes, base64) in
`packages/api/.dev.vars`, and the same `PROVISION_TOKEN` in
`packages/partner/.dev.vars`. Both files are ignored by git.

## License

MIT
