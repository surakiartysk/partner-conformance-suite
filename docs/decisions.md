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
