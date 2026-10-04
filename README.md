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

Next: the runner and its cases, then reference partners that are deliberately
wrong in one way each — so that every case is shown to catch the bug it is
for — and then the dashboard.

## Layout

```
packages/spec      the Points Partner API, linted with Redocly
packages/partner   the reference partner: Worker + D1
docs/decisions.md  what was chosen, why, and what it costs
docs/mutations.md  every test, shown to fail
```

## Running it

Node 22 and pnpm.

```bash
pnpm install
pnpm verify                  # format, lint (code and spec), types, leak check, tests
pnpm --filter @conformance/partner db:migrate
pnpm dev:partner             # the reference partner on :8788
```

Provisioning a tenant needs `PROVISION_TOKEN` in `packages/partner/.dev.vars`;
there is no default, on purpose.

## License

MIT
