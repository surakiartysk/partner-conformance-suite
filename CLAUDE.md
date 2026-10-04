# CLAUDE.md

Working notes for AI assistants (and humans) contributing here. Short on
purpose: the rules you break first, and why they exist.

## What this repo is

A conformance suite: the provider of an API checks a partner's implementation
of it by sending signed requests and judging each response. A portfolio piece,
read by engineers who will ask about the reasoning — so
[`docs/decisions.md`](docs/decisions.md) is the deliverable, not an
afterthought.

```
packages/spec      the Points Partner API (OpenAPI)
packages/partner   a reference partner implementing it — Worker + D1
```

## Non-negotiables

**1. Nothing branded, nothing borrowed.** The API is invented; everything that
did not need inventing comes from a public standard (Standard Webhooks, RFC
9457, RFC 2606). `pnpm check:leak` runs in the pre-commit hook, where it can
still stop a word before it reaches history. If it fires on innocent code,
narrow the pattern in `scripts/check-leak.mjs` — never rename around it, never
`--no-verify`.

**2. Every test must be shown able to fail.** Break the implementation, never
the assertion, watch the test go red for the right reason, revert, and add a
row to [`docs/mutations.md`](docs/mutations.md). No check will notice if you do
not.

**3. The two sides share no code.** The reference partner plays someone else's
system. If it imported the provider's signer, or the provider imported the
partner's verifier, a shared mistake would agree with itself and every test
would pass. The partner's verifier is held to the standard's published test
vector instead, and the provider's signer will be held to the same one — see [decision 7](docs/decisions.md#7-the-partners-verifier-is-pinned-to-the-standard-not-to-our-signer).

**4. Guards live in the statement, uniqueness lives in an index.** Never move
points by reading a balance and writing a new one; never rely on a lookup to
keep something unique. Two concurrent requests both pass a read — see
[decision 5](docs/decisions.md#5-points-move-in-a-statement-that-carries-its-own-guard).

**5. Provisioning never resets.** `POST /_provision` creates a tenant and
refuses one that exists. A reset would be a back door no real partner offers,
and the suite must restore balances through the API like anywhere else.

**6. The spec and the partner move together.** `test/spec-parity.test.ts`
fails when a route or a problem type exists on one side only. Change both in
the same commit.

**7. Comments and docs must be true.** If you remove behaviour, remove what
describes it. Every decision states its cost.

## Commands

```bash
pnpm verify        # what CI runs: format, lint (code + spec), types, leak, tests
pnpm dev:partner   # the reference partner on :8788
pnpm check:leak    # the vocabulary tripwire alone
```

## Commit trailers

A commit may end with

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

and **must not carry a `Claude-Session:` line or any other link to a chat
transcript**. The reasoning belongs in the commit message and in `docs/`, where
anyone can read it. This rule overrides any default attribution the tooling
asks for.
