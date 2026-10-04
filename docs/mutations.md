# Mutations

A test that has never failed has not shown it can. Each row is a deliberate
break in the **implementation** — never in a test's assertion — the test that
went red, and the message it gave. Every break was reverted after its run.

All 63 tests in `packages/partner` have been made to fail by at least one row
below. A new test is not done until it has a row too.

## Reference partner

### Signing and the request path

| #   | Mutation                                                                | Caught by                                                                                                                                              | Failure                                                                                            |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | Signed content joined with `:` instead of `.`                           | accepts the published test vector — 41 in all                                                                                                          | `expected { ok: false, … } to deeply equal { ok: true }`                                           |
| 2   | The test signer joins with `:` (the helper is the code under test here) | the test signer produces that same signature — 39 in all                                                                                               | `expected 'v1,XQXFGNL04yyfi0mNo5guVq6SFdpEnOJGo3…' to be 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELV…'` |
| 3   | The verifier falls through to "accepted" when no signature matches      | refuses the vector with one byte of the body changed; refuses it when the id or the timestamp is not the one signed — 8 in all                         | `expected { ok: true } to deeply equal { ok: false, … }`                                           |
| 4   | Only the first of several signatures tried                              | accepts when any one of several signatures verifies, as during a rotation                                                                              | `expected { ok: false, … } to deeply equal { ok: true }`                                           |
| 5   | A signature under an unknown version accepted                           | ignores a signature under a version it does not know                                                                                                   | `expected { ok: true } to deeply equal { ok: false, … }`                                           |
| 6   | `atob` errors not caught                                                | treats a header that is not base64 as a wrong signature, not an error                                                                                  | `InvalidCharacterError: atob() called with invalid base64-encoded data`                            |
| 7   | Missing headers reported as a bad signature                             | refuses a request missing webhook-id / -timestamp / -signature as missing-signature — 4 in all                                                         | `expected 'invalid-signature' to be 'missing-signature'`                                           |
| 8   | Timestamp tolerance not checked                                         | refuses a timestamp outside the tolerance, in either direction; accepts a timestamp at the edge…                                                       | `expected 200 to be 401`                                                                           |
| 9   | Timestamp format not checked                                            | refuses a timestamp that is not plain seconds, even when signed                                                                                        | `expected { ok: true } to deeply equal { ok: false, … }`                                           |
| 10  | A bad signature let through by the middleware                           | refuses a request signed with another secret; refuses one tenant's signature on another tenant's path; refuses a body changed after signing — 4 in all | `expected 200 to be 401`                                                                           |
| 11  | A replayed id not refused                                               | refuses a webhook-id it has already accepted, and applies the first only                                                                               | `expected 200 to be 409`                                                                           |
| 12  | The id recorded before the signature is checked                         | does not let an unauthenticated request use up an id; refuses a request missing webhook-id                                                             | `expected 409 to be 200`; `expected 500 to be 401`                                                 |
| 13  | Accepted ids remembered for the tolerance, not twice it                 | keeps refusing ids within the window a future-dated timestamp stays valid                                                                              | `expected 200 to be 409`                                                                           |
| 14  | Every variant accepted                                                  | answers an unknown variant or tenant with a problem document                                                                                           | `expected 200 to be 404`                                                                           |
| 15  | Tenant expiry ignored                                                   | treats an expired tenant as unknown                                                                                                                    | `expected 200 to be 404`                                                                           |
| 16  | Hono's default not-found handler                                        | answers an unknown path with a problem document, not plain text                                                                                        | `expected 'text/plain; charset=UTF-8' to be 'application/problem+json'`                            |
| 17  | Problems served as `application/json`                                   | answers an unknown member with an RFC 9457 problem — 3 in all                                                                                          | `expected 'application/json' to be 'application/problem+json'`                                     |

### Members

| #   | Mutation                                     | Caught by                                    | Failure                                                                |
| --- | -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| 18  | Member lookup not scoped to the tenant       | does not show another tenant's member        | `expected 200 to be 404`                                               |
| 19  | Balance lookup not scoped to the tenant      | does not show another tenant's balance       | `expected 200 to be 404`                                               |
| 20  | An unknown member's balance answered as 0    | answers an unknown member with 404 (balance) | `expected 200 to be 404`                                               |
| 21  | The member response also carries the balance | returns the member as the spec shapes it     | `expected { id: 'mbr_…', …(3) } to deeply equal { id: 'mbr_…', …(2) }` |

### Points

| #   | Mutation                                                             | Caught by                                                                                   | Failure                                                                                 |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 22  | Earn subtracts                                                       | adds the points and reports the balance after — 10 in all                                   | `expected { …(5) } to match object { type: 'earn', …(3) }`                              |
| 23  | Redemption reads the balance, checks it, then writes without a guard | lets only one of two redemptions of the whole balance through                               | `expected [ 200, 200 ] to deeply equal [ 200, 422 ]`                                    |
| 24  | Redemption guard `>` instead of `>=`                                 | can take the whole balance, and not a point more — 4 in all                                 | `expected 422 to be 200`                                                                |
| 25  | A repeated reference never compared with its payload                 | refuses a reference reused with a different payload; …already used by a different operation | `expected 200 to be 409`                                                                |
| 26  | A repeat answered with the current balance                           | answers a repeat with the balance as it stood then, not now                                 | `expected 1050 to be 1100`                                                              |
| 27  | No lookup for a repeat before applying                               | answers a repeat with the original even when the balance could no longer cover it           | `expected 422 to be 200`                                                                |
| 28  | A lost race on the reference rethrown, not answered                  | applies one of two identical requests racing each other                                     | `expected [ 200, 500 ] to deeply equal [ 200, 200 ]`                                    |
| 29  | `points` only type-checked                                           | refuses points of 0 / -5 / 1.5 / 1000001                                                    | `expected 500 to be 400` (0 and -5 reach the table's `CHECK`); `expected 200 to be 400` |
| 30  | `reference` length unchecked                                         | refuses a missing or overlong reference…                                                    | `expected 200 to be 400`                                                                |
| 31  | A `null` body not refused                                            | refuses a missing or overlong reference, and a body that is not an object                   | `expected 500 to be 400`                                                                |
| 32  | Unknown member not checked before applying                           | answers an unknown member with 404 (earn)                                                   | `expected 422 to be 404`                                                                |
| 33  | Reversing an earn without the balance guard                          | refuses to reverse an earn whose points have been spent                                     | `expected 200 to be 422`                                                                |
| 34  | Reversing a redemption subtracts                                     | undoes a redemption                                                                         | `expected 400 to be 1000`                                                               |
| 35  | A reversal may be reversed                                           | refuses to reverse a reversal                                                               | `expected 200 to be 422`                                                                |
| 36  | No unique index on `reverses`                                        | lets only one of two different reversals racing each other through                          | `expected [ 200, 200 ] to deeply equal [ 200, 409 ]`                                    |
| 37  | The already-reversed lookup removed, leaving only the index          | says already reversed, not insufficient points, when both would be true                     | `expected 422 to be 409`                                                                |
| 38  | Transaction lookup not scoped to the tenant                          | answers an unknown transaction, or another tenant's, with 404                               | `expected 422 to be 404`                                                                |

### Provisioning

| #   | Mutation                                | Caught by                                                                  | Failure                                              |
| --- | --------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| 39  | Members start with 0 points             | creates a tenant with two members holding the starting balance — 25 in all | `expected [ +0, +0 ] to deeply equal [ 1000, 1000 ]` |
| 40  | The token not compared                  | refuses without the token, or with a wrong one                             | `expected 201 to be 401`                             |
| 41  | A default token when none is configured | is off, rather than open, when no token is configured                      | `expected 401 to be 503`                             |
| 42  | Tenant id format unchecked              | refuses a malformed tenant id or a short or foreign secret                 | `expected 201 to be 400`                             |
| 43  | Secret length unchecked                 | refuses a malformed tenant id or a short or foreign secret                 | `expected 201 to be 400`                             |
| 44  | An existing tenant no longer refused    | refuses an existing tenant and leaves its balances where they were         | `expected 201 to be 409`                             |

### The spec

| #   | Mutation                              | Caught by                                     | Failure                                                                                            |
| --- | ------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 45  | The reversals route not registered    | serves exactly the operations the spec lists  | `expected [ 'GET /members/{memberId}', …(3) ] to deeply equal [ 'GET /members/{memberId}', …(4) ]` |
| 46  | A problem type the spec does not name | names every problem it can return in the spec | `expected [ 'points-frozen' ] to deeply equal []`                                                  |

## Tests that could not fail, found on the way

Running the mutations is what found these. Each one passed whatever the code
did.

- **"refuses a timestamp that is not plain seconds".** It sent `' 1614265330'`
  and friends with the vector's original signature. The timestamp is part of
  what is signed, so each one failed the signature whatever the format check
  did. It now signs every malformed timestamp properly, so only the format
  check can refuse it — row 9.
- **"treats a header that is not base64 as a wrong signature".** It sent
  `v1,not base64!`, which the verifier splits at the space into `v1,not` — and
  `not` is valid base64. Nothing ever threw. It now sends `v1,***` — row 6.
- **"answers an unknown variant … with a problem document".** It asked for
  `/members/x`, so the 404 came from the missing member whether the variant
  was checked or not. It now asks for a real member — row 14.
- **"a body that is not an object".** An array or a number failed the field
  checks whatever the object check did. The object check was removed as
  redundant, and the test now also sends `null`, the one body that would
  otherwise reach the destructuring — row 31.
