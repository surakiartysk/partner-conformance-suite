# Proposal: testing a partner's own API

**Status: proposed, not built.** Nothing here exists in the code. It is written down so the decision to build it,
or not, is made on what it would cost. If it is built, the parts that survive become decisions in
[decisions.md](../decisions.md) and this file goes.

## The question

A conformance suite exists so a partner can point it at **its own** implementation. The deployed suite cannot: it
tests a sample partner built into the site, and it says so on every page. The owner asked for the real thing, a
partner entering its own address, and was advised to see the cost first. This is that cost.

## What is true today, and why it matters here

- **The suite reaches nothing on the internet.** Every request goes to the sample partner through a Cloudflare
  service binding (`env.PARTNER.fetch` in `packages/api/src/partner.ts`), and its address is built from the
  deployment's `PARTNER_ORIGIN`, never from a request (decision 1.1 of the plan, and architecture.md, "The three
  connections"). Testing a partner's own API is the first time the suite would open a connection to an address a
  person typed. Everything below follows from that one change.
- **A session is provisioned, not configured.** "Try it" calls the sample partner's `/_provision` with an operator
  token and gets a tenant, a signing secret and two members of 1,000 points. A real partner has no `/_provision`,
  and should not grow one for the suite's sake.
- **Points are given back through the partner's own API** (members.ts, decision 24): a baseline is written down
  before a member's points move, and restored afterwards with ordinary earns and redemptions. That part works
  against any partner that implements the spec, which is the point of it.

## Two ways to offer it

**A. A self-hosted deployment, behind a password.** The plan's original answer (decision 1.1, and decision 35's
note that a sign-in exists "for one case only"). The provider, or a partner, deploys its own copy of the suite with
a flag that turns the address field on, and a password in front of it. The public demo stays exactly as it is.

**B. An address field on the public demo.** Anyone could type any address.

**Recommendation: A, and not B.** B makes the public site a machine anyone can point at anyone else: signed requests
on demand, at a rate the visitor chooses, to an address the visitor chooses, from Cloudflare's network. Rate limits
and checks shrink that; they do not remove it, and nothing about the demo needs it. The rest of this file is about A.

## What A would take

### 1. Turning it on

- A deployment variable, off by default, as `SIMULATE_DISPATCH` is in the run dashboard: a clone or the public
  deployment never inherits it.
- A password for the deployment, stored as a PBKDF2 hash through WebCrypto, with failed attempts limited by
  address, as the run dashboard's decision 28 does. Not an account system: one deployment, one secret.

### 2. The address, and what may be connected to

The guard against server-side request forgery is the part that has to be right, and the part with the most
unknowns:

- **https only, port 443 only,** a host name rather than an IP literal, no credentials in the URL, and a path the
  suite appends to, never one it reads from the address.
- **No redirects followed** (`redirect: 'manual'`): a 3xx is a failed case, not a new destination.
- **Private and special addresses refused:** loopback, link-local, RFC 1918, carrier-grade NAT, the metadata
  address, IPv6 unique-local, and their mapped forms.
- **Unknown, to be measured before anything else:** a Worker's `fetch` resolves the name itself, so the suite cannot
  check the address it actually connects to. A name that resolves to a public address when checked and a private
  one when used (DNS rebinding) may pass any check made in the Worker. What Cloudflare's network refuses on its own
  (private ranges, its own addresses) has to be found out by trying it, not assumed. If it cannot be closed, A
  needs the partner to prove it owns the name (below) and is limited to that name.
- **Proof of ownership, optional for A, required for B:** the partner serves a token the suite gives it at a
  well-known path on the address, and the suite tests only an address that has served it.

### 3. What a partner has to supply

There is no `/_provision`, so a session is configured instead of provisioned:

- the **base URL**;
- the **signing secret** the partner verifies with, stored sealed as today's are (decision 21: AES-GCM, the key a
  Worker secret, never shown again);
- **two test members** that the cases may move points on, with enough balance for the redemption cases, and the
  understanding that the suite will move their points and put them back.

The suite reads each member's balance before a run and restores it after, as it does now.

### 4. What changes in the result

- **No versions.** "Partner version", "correct" and the planted bugs belong to the sample. A partner's own run has
  one target, and the result page loses "What was wrong with …", which has nothing to say about a real partner.
- **Every case is the same case.** Nothing about the cases, the runner or the judging changes: they already judge a
  partner by the spec and nothing else. That is the strongest argument that A is feasible.

### 5. Limits on what the suite sends

Today's limits count session starts and runs. Against a real partner the suite would also need a ceiling on requests
per run and per hour, a timeout per request (it has one), and a concurrency of one lane at a time if a partner asks
for it, because a partner's staging environment may be smaller than the sample.

## What it would cost

- **Security work that cannot be finished by reading.** The address guard and the rebinding question need tests
  against real resolution, not mocks, and a decision if the answer is "it cannot be closed in a Worker".
- **A second shape of session** (configured, not provisioned) through the API, the pages and the sweep.
- **A deployment that is not the demo,** which someone has to run to show it working, and which the public site
  cannot show.
- **Nothing on the public demo changes,** which is also the cost: a visitor still cannot try their own API there.

## If it is built, in this order

1. Measure what a Worker's `fetch` will and will not reach: private ranges, a rebinding name, redirects. Write down
   the answer before writing the guard.
2. The address guard and its tests, on their own, with no page.
3. The configured session: base URL, sealed secret, two members, behind the deployment flag and the password.
4. The result page without versions.
5. A decision entry for each of the above, with its cost, and this file removed.
