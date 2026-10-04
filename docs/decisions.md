# Decisions

Each entry says what was chosen, why, and what it costs. An entry whose cost
reads "none" has not been examined hard enough.

The suite is being built in stages; this file grows with what is actually
built, not with the plan.

---

## 1. The contract is built from open standards, and carries no brand

The Points Partner API is invented for this repository, but the parts that
did not need inventing are taken from public standards:

- **Signing** follows [Standard Webhooks](https://www.standardwebhooks.com/):
  `webhook-id`, `webhook-timestamp`, `webhook-signature`, HMAC-SHA256 over
  `id.timestamp.body`.
- **Errors** are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem
  documents.
- **Hosts** are under `.example`, which RFC 2606 reserves for exactly this.

There is no product name. An invented brand can collide with a real trademark
nobody thought to search for; "Points Partner API" cannot.

**Cost.** The standard's choices come with it. Standard Webhooks is symmetric
— the provider and the partner hold the same secret — so a partner that wants
to verify with a public key is out of scope, and so is any partner whose
existing integration signs some other way.

## 2. A replayed `webhook-id` is refused, not answered again

Standard Webhooks resends a failed message under the **same** `webhook-id`, so
that the receiver can use it to deduplicate. This spec does not: the provider
gives every attempt a new id, and a partner refuses an id it has already
accepted with `409`.

The reason is that the idempotency of the business operation already has a
home — `reference`, in the body, chosen per operation. Making the id carry it
as well would give a partner two keys to reconcile, and "refuse what you have
seen" is simpler to implement and to test than "replay the stored response".

**Cost.** A deliberate departure from the standard on retries. A partner who
reads the standard rather than this spec will expect resends to reuse the id,
which is why the spec says so in its own words.

## 3. Accepted ids are remembered for twice the tolerance

The first version remembered an id for five minutes, the same as the timestamp
tolerance. That leaves a hole: a request signed close to five minutes **ahead**
of the partner's clock is accepted, and its timestamp stays acceptable until
five minutes after it — ten minutes in all. Once its id is forgotten at five,
a byte-for-byte copy gets through.

So the window is `2 × TOLERANCE_SECONDS`, stated in the spec as a requirement
on the partner, and pinned by a test that moves the clock seven minutes on and
replays a future-dated request.

**Cost.** Twice the stored ids, and a requirement on partners that is easy to
read past. A partner that gets it wrong passes every case except the one that
tests it, which is the point of having that case.

## 4. A reference is unique per partner, across every operation

`reference` identifies one intended operation. Repeating it with the same
payload returns the original transaction unchanged — including the balance as
it stood then — and moves nothing. Repeating it with a **different** payload,
or for a different operation, is refused with `409 reference-conflict`.

Silently returning the first result for a different payload would hide a
caller's bug: they would believe they had redeemed 999 points when they had
not. Refusing is what Stripe does with its idempotency keys, for the same
reason.

**Cost.** The provider must mint a reference per operation. A natural key such
as an order number cannot be reused for an earn and its later reversal; it has
to be decorated, which is one more thing a caller can get wrong.

## 5. Points move in a statement that carries its own guard

A redemption is not "read the balance, check it, write the new one". Two
redemptions of a whole balance arriving together would both read 1,000, both
pass, and both subtract.

Instead each movement is one D1 batch — a transaction — of two statements:

```sql
INSERT INTO transactions (...)
SELECT ... FROM members WHERE tenant = ? AND id = ? AND balance >= ?;

UPDATE members SET balance = balance + ?
 WHERE ... AND EXISTS (SELECT 1 FROM transactions WHERE id = ?);
```

The guard is in the INSERT's WHERE clause, so the second redemption finds the
balance already reduced and inserts nothing; the UPDATE applies only if the row
exists. A reference can be used once and a transaction reversed once because
the database has unique indexes on `(tenant, reference)` and `(tenant,
reverses)` — not because of a lookup that two concurrent requests could both
pass. The lookups are still there, and not only for speed: where the guard
and the lookup would both refuse, the lookup gives the answer that is true. A
repeated redemption after the balance has been spent is the original
redemption, not "insufficient points"; a second reversal after the points have
gone is "already reversed". Without the lookups, the guard would answer first
and say the wrong thing — mutations 27 and 37 in
[mutations.md](mutations.md) show it. The indexes are what make uniqueness
true; the lookups are what make the answers right.

Both races are tested by sending the two requests at once. The redemption test
fails against a read-then-write version of the same code, and the reversal
test fails once the unique index on `reverses` is dropped and only the lookup
is left — so each test is known to depend on the guarantee it names.

**Cost.** The SQL is less obvious than the three-step version, and a lost race
surfaces as a constraint violation that has to be caught and turned into the
answer the winner got. The balance column has no `CHECK (balance >= 0)`,
because the reference partner's buggy versions need to be able to overdraw;
the guard lives only in the statement.

## 6. The reference partner hosts many copies of itself, and never resets one

The suite needs a partner to run against, and its demo needs one per visitor
session, so that two strangers never wait on each other's locks. The reference
partner serves the API under `/{variant}/{tenant}/`, and the suite treats that
whole prefix as a partner's base URL.

A tenant is created by `POST /_provision`, which is **not** part of the spec: a
real partner is set up by its own onboarding. It creates and never resets — a
tenant that exists is refused with `409` and left untouched. If provisioning
could reset a tenant, the suite could quietly put a balance right after a run,
and a real partner offers nothing of the kind. The suite has to restore
balances through the API, as it would anywhere else.

`PROVISION_TOKEN` has no default. Unset, provisioning answers `503`, because a
default would be a token anyone can read in this repository.

**Cost.** A tenant whose balance a failed run has wrecked stays wrecked until it
expires after a day. And a fresh deployment cannot provision anything until a
secret has been set by hand.

## 7. The partner's verifier is pinned to the standard, not to our signer

The provider signs and the partner verifies. If one implementation did both, a
mistake in it — the wrong separator, the body re-serialised rather than taken
as sent — would sign and verify consistently, and every test would pass.

So the partner's verifier is written against the standard, and its first test
is the test vector Standard Webhooks publishes. The tests sign with a separate
helper that is held to the same vector. Neither side imports the other.

**Cost.** Two HMAC implementations in one repository, which looks like
duplication to anyone who has not read this entry. The provider's signer, when
it is built, will be a third, and will be held to the same vector.

## 8. The reference partner keeps its secrets as given

Each tenant's signing secret is stored as received. This package plays the
partner, and how a partner stores its secret is the partner's business; what
the suite can check is only how the partner behaves.

**Cost.** Anyone with the reference partner's database can sign as the provider
for every tenant. The tenants are throwaway and expire in a day, so this was
accepted here. The provider's side, which keeps the same secrets, will not
store them this way.

## 9. The tests run in workerd, against a real D1

Every property worth testing here lives at the database: that two redemptions
cannot both succeed, that a reference is unique, that a transaction reverses
once. A mock of D1 would return whatever the test told it to and prove none of
that. The tests run in workerd through `@cloudflare/vitest-pool-workers`, call
the Worker's own `fetch`, and use a real local D1.

**Cost.** Storage is shared within a test file, so every test provisions its own
tenant and asserts only against it. A test that counted rows globally would
pass alone and fail in company.

## 10. A case says what it expects as a value, not as assertions

A case's expectation is a plain object — status, some headers, a body — whose
leaves are literals or matchers. The runner compares a response against it,
and the result page will show the same object in its "expected" column. What
is shown and what is checked are one thing, so they cannot disagree. With
`expect(...)` calls scattered through code, the expected column would need a
description written beside them, and one day it would describe something the
code no longer checks.

The matcher vocabulary is kept small — any string, any integer, one of, a
media type, and arithmetic on a balance — because each one is something a
partner's engineer has to read and agree with. The arithmetic carries its own
description: `start.plus(100)` checks for 1,100 and reads "balance at start +
100 = 1,100" from the same call, so the formula on the page is the sum that
was tested.

Comparison is tolerant in one direction only. A field the expectation names
must be there and match; a field the response adds is ignored, so a spec can
grow without breaking partners who answer with more than it asks.

**Cost.** A check the vocabulary cannot say needs a new matcher, which is a
change to review rather than a line in a case. And a case cannot express "this
or that, depending" — it says one thing, or it is two cases.

## 11. A case is arrange, act, verify — and a failed arrange is not a failure

**Arrange** puts the partner where the case needs it: an earn to reverse, a
request to replay. **Act** is the request being judged. **Verify** reads back
what the act should have changed — the balance after a refused redemption — and
is judged as well, because a partner that answers "insufficient points" and
takes the points anyway has not conformed.

If arrange goes wrong, the case ends as `error`, not `failed`. A reversal case
whose earn was refused has learned nothing about reversals, and calling it a
failed reversal would send a partner to look in the wrong place.

The exception is a partner that does not answer a setup step in time — the
starting balance, or an arrange step. That ends the case as `timed_out`, the
same as a slow act. Stage 2 returned `error` there; building `slow-balance`
showed it was wrong, because it made ten cases report `error` ("something is
wrong with this case") for a partner that was merely slow. A wrong answer to a
setup step is an `error`; no answer is a `timed_out`, wherever it happens.

**Cost.** A partner whose earn is broken sees the earn cases fail and the
reversal cases come back as errors — more red than the one bug deserves. The
statuses are different on purpose, but someone has to read them as different.

## 12. Every writing case reads its own starting balance

Before a case that can change a balance, the runner reads that balance, and
every expectation about it is relative: "balance at start + 100", never
"1,100". A fixed number is right only on a fresh member; a member used by
anything since — an earlier case, an earlier run, the partner's own testers —
breaks it.

The test that holds this runs every case, in order, against one tenant. Run
one at a time on fresh tenants, an assumed starting balance of 1,000 would be
right by luck, and that test alone notices when it is assumed rather than read
(mutation 91).

**Cost.** One more request per writing case. And a balance that someone else
moves _during_ a case still breaks it — reading first only protects against
what happened before. Stopping that is the job of the per-member lock, which
comes with runs.

## 13. Which cases may run together is decided by member, not by money

The first framing was "money cases run one at a time, the rest in parallel".
What actually breaks an expectation is narrower: two cases changing the same
member's balance at once, each reading a starting balance the other is about
to move. So a case declares which member it is about and whether it `writes`,
and `planLanes` queues writing cases per member in their declared order, while
everything else runs alongside. The catalogue puts its writing cases on both
members, so a run has two lanes moving side by side.

`writes` means _could_ change the balance — including only if the partner is
wrong. Earning zero points writes nothing on a correct partner, and is still
marked `writes`, because the partner under test may not be correct.

**Cost.** `writes` is a declaration, and nothing checks that it is honest. A
case that moves a balance while claiming not to would run beside the cases
that read that balance, and fail now and then for no reason anyone could see.

## 14. The runner builds every request, and owns every limit

Everything a request carries — the URL, the body, the headers, the signature —
is built by the runner from the case and from a target the server chose. The
same applies to how much of the answer is kept:

- **Timeouts are raced, not only aborted.** The request is given an abort
  signal, and the wait for it also races a timer, so a transport that ignores
  the signal still cannot hold a case past its limit. A case that runs out of
  time is `timed_out`, not `failed`: a partner that is slow and a partner that
  is wrong need different fixes.
- **A body is read up to 64 KB and no further.** It is streamed and cut, not
  read whole and trimmed, so a partner that answers with a gigabyte does not
  get one into memory. A body that was cut is kept as text and fails the case.
- **Headers are shown by allowlist.** `content-type` and the three signing
  headers are shown; every other header is shown by name with its value
  hidden. A denylist fails open: the day a partner answers with a token in a
  header nobody thought of, it would be on the page. An allowlist can only
  hide too much.

**Cost.** The allowlist hides headers a partner may want while debugging — a
request id of their own shows as `•••`. And 64 KB is a guess; a legitimate
response larger than that cannot pass.

## 15. A refused signature may be reported as any of the three problem types

The spec names three problem types for a request the partner cannot
authenticate — missing signature, invalid signature, stale timestamp — and
does not require a particular one for each fault. So the security cases accept
any of the three, and insist only on the `401`, the problem document and its
media type.

**Cost.** A partner that reports a stale timestamp as an invalid signature
passes, though its logs will mislead whoever reads them. Tightening this would
be a change to the spec first, and to the cases after.

## 16. Every wrong version is `correct` with one behaviour off

The reference partner is served as nine versions, and eight of them are wrong.
They are not eight copies with different bugs patched in: each is the correct
partner with exactly one flag in a `Behaviour` record switched off, and the
routes read the flag. Every flag is written so that `true` is the correct
behaviour, which keeps "what is a bug" a single reading of the record.

Three tests hold the rule. Every other version differs from `correct` in
exactly one flag; every flag is off in exactly one version; and a version that
is wrong in two ways — which would send whoever reads a red case to the wrong
place — fails the first.

**Cost.** The partner's code now has seven places that ask "is this the version
that is wrong here?". They are small and named, but a reader of `points.ts`
meets them before meeting the logic. The alternative, a separate copy of the
partner per bug, would have been eight files that drift from `correct` the
first time it changes.

## 17. A bug that has to get past an index does it by making the key unique

Two of the bugs — repeating an earn's reference, reversing a transaction twice
— are things the schema forbids, on purpose: `(tenant, reference)` and
`(tenant, reverses)` are unique (decision 5). All versions share one schema, so
a version with the matching bug cannot drop the index. It gets past it the way
a real partner without the index effectively would: it stores the reference, or
the reversed id, with `#` and the new transaction's id appended, so every key
is different. A lookup by reference then finds nothing, which is the bug, and
one function strips the suffix when a reversal is read back.

**Cost.** Correct code carries a line that only a wrong version uses, and the
suffix is a convention that two functions have to agree on. Mutations 105 and
106 are what check that they do: strip it in one place and not the other and a
reversal answers with an id nobody issued.

## 18. `docs/variants.md` is the expectation, and the test reads it

What each version must get wrong is a table in a document, and
`variants.test.ts` parses that document. The expectation is not a second copy
in code that could drift from what the page says: change one and the test is
red until the other agrees.

The test runs every case against every version, each case on a tenant of its
own, and compares in both directions. A case that goes red where the table does
not expect it depends on something it should not; a case that stays green where
the table expects red does not check what it claims. The failure says which case
and which version — `security/tampered-body was failed, and the table does not
expect ignores-signature to fail it` — because the first version of the test said
`expected { …(3) } to deeply equal { …(2) }`.

**Cost.** The test parses markdown, and a table reformatted in a way the parser
does not expect is red for a reason that has nothing to do with the cases. It
reads backticked case ids from the last cell and the status from the third, and
fails loudly rather than skipping a row it cannot read.

## 19. `slow-balance` is wide, and says so

A partner that holds a balance read cannot be tested for anything that moves
points, because every such case reads the balance first. The version is
therefore expected to fail eleven cases — `member/balance` and the ten that
declare `writes` — and all of them as `timed_out`. The test checks that list
against the cases' own `writes` flags. A case that starts reading a balance
without declaring `writes` is one the version now times out and the table does
not expect, so it goes red until someone decides which is wrong. What it cannot
notice is the reverse — a case that moves a balance and says it does not — which
stays the promise decision 13 says it is.

The wait is held until the caller gives up and not for a fixed time: the partner
sleeps on the request's abort signal, so a runner that times out and aborts frees
the request, and a test with a 300 ms timeout does not leave a 15-second timer
behind it.

**Cost.** A very wide red is one that says little: eleven `timed_out` cases is
"the balance is slow", which is exactly right, but no case in this version
exercises its own assertions. The version proves the runner's handling of
slowness, not any case.

## 20. Cases that no version makes fail are listed, not hidden

The rule is that every case needs a version that makes it fail, or it has not
been shown to catch anything. The nine versions agreed in design make ten of the
twenty cases fail by assertion. The other ten — one a deliberate control — are
listed in `docs/variants.md` under "Cases no version makes fail", and the test
holds that list to the code in both directions: a case on it that a version now
makes fail is an error, and so is a new case that is neither covered nor listed.

This does not close the gap. It makes it visible, and stops it growing without
anyone choosing to let it. Closing it takes more versions: one that omits a
field, one that miscounts an earn, one that accepts zero points, one that
dedupes redemptions the way `double-earn` fails to dedupe earns.

**Cost.** Nine of those ten cases are, today, assertions nobody has seen fail.
Their arithmetic and shapes are checked only against a partner that is right.
