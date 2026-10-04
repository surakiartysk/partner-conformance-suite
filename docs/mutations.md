# Mutations

A test that has never failed has not shown it can. Each row is a deliberate
break in the **implementation** — never in a test's assertion — the test that
went red, and the message it gave. Every break was reverted after its run.

Every test in the repository has been made to fail by at least one row below:
the 63 in `packages/partner`, the 19 in `packages/cases` and the 39 in
`packages/api`. A new test is not done until it has a row too.

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

## Cases and matchers

| #   | Mutation                                                   | Caught by                                                                                                                    | Failure                                                                                       |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 47  | A response with fields the expectation does not name fails | passes a response with fields the expectation does not name — 20 in all, every case against the reference partner among them | `expected [ { path: '$', … } ] to deeply equal []`                                            |
| 48  | A missing field not flagged                                | fails a field the expectation names and the response lacks, as missing                                                       | `expected [] to deeply equal [ { path: '$.tier', … } ]`                                       |
| 49  | Nested paths not built                                     | names the path of a nested mismatch                                                                                          | `expected [ { path: '$[1]', … } ] to deeply equal [ { path: '$.a.b[1].c', … } ]`              |
| 50  | Array length unchecked                                     | requires arrays to match in length                                                                                           | `expected [] to deeply equal [ { path: '$', … } ]`                                            |
| 51  | A non-object accepted where an object is expected          | fails an object expected where something else arrived                                                                        | `expected [] to deeply equal [ { path: '$', … } ]`                                            |
| 52  | Loose equality                                             | does not treat a number and its string as equal                                                                              | `expected [] to have a length of 1 but got +0`                                                |
| 53  | A matcher's mismatch reported without its description      | uses a matcher where one is given, and reports its description                                                               | `expected [ { path: '$.balance', … } ] to deeply equal [ { path: '$.balance', … } ]`          |
| 54  | Matchers shown as raw objects in the expected column       | shows matchers by description, and literals as they are                                                                      | `expected { id: { kind: 'matcher', … } } to deeply equal { id: '‹any non-empty string›', … }` |
| 55  | `any.string` accepts `''`                                  | any.string wants a non-empty string                                                                                          | `expected [ true, true, false ] to deeply equal [ true, false, false ]`                       |
| 56  | `any.integer` accepts `'3'`                                | any.integer wants an integer, not a numeric string or a fraction                                                             | `expected [ true, false, true ] to deeply equal [ true, false, false ]`                       |
| 57  | `oneOf` accepts anything                                   | oneOf matches only its values                                                                                                | `expected [ true, true ] to deeply equal [ true, false ]`                                     |
| 58  | `mediaType` compared as a whole string                     | mediaType ignores parameters and case, and nothing else                                                                      | `expected false to be true`                                                                   |
| 59  | `Quantity.plus` describes the start rather than the sum    | uses a matcher where one is given, and reports its description                                                               | `expected [ { path: '$.balance', … } ] to deeply equal [ … ]`                                 |
| 60  | Two cases share an id                                      | has unique ids, each prefixed by its service                                                                                 | `expected 19 to be 20`                                                                        |
| 61  | An act without an expectation                              | gives every act and verify step an expectation                                                                               | `expected [ 'member/unknown:request' ] to deeply equal []`                                    |
| 62  | A case asks for `/points/reverse`, which the spec lacks    | asks only for operations the spec lists                                                                                      | `expected [ Array(1) ] to deeply equal []`                                                    |
| 63  | A replay names its own step                                | names, in every replay, a step that comes before it                                                                          | `expected [ 'original' ] to include 'replay'`                                                 |
| 64  | Every writing case queued on member A                      | queues writing cases per member in order…                                                                                    | `expected false to be true`                                                                   |
| 65  | Lane order reversed                                        | queues writing cases per member in order…                                                                                    | `expected [ 11, 10, 9, 4 ] to deeply equal [ 4, 9, 10, 11 ]`                                  |
| 66  | A case filed under the wrong service                       | has unique ids, each prefixed by its service                                                                                 | `expected 'earn' to be 'redeem'`                                                              |

## The runner

| #   | Mutation                                           | Caught by                                                                                  | Failure                                                                                                 |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 67  | Signed content joined with `:`                     | sign produces the published test vector — 19 in all                                        | `expected 'v1,XQXFGNL04yyfi0mNo5guVq6SFdpEnOJGo3…' to be 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELV…'`      |
| 68  | The `whsec_` prefix not checked                    | refuses a secret that is not in whsec_ form                                                | `expected [Function] to throw error matching /whsec_/ but got 'Imported HMAC key length (0) must be …'` |
| 69  | Secrets of 16 bytes                                | newSecret is whsec_ and 32 random bytes — 22 in all, as the reference partner refuses them | `expected 'whsec_…' (24 base64 characters) to match /^whsec_[A-Za-z0-9+/]{43}=$/`                       |
| 70  | The same secret every time                         | newSecret is … different every time                                                        | `expected 'whsec_BwcHBwcH…' not to be 'whsec_BwcHBwcH…'`                                                |
| 71  | The body sent pretty-printed                       | builds the URL from the target and signs the body exactly as sent                          | `expected '{\n "b": 1, …' to be '{"b":1,"a":[2]}'`                                                      |
| 72  | A trailing slash on the base URL kept              | builds the URL from the target…                                                            | `expected 'https://partner.example/base//points/…' to be 'https://partner.example/base/points/e…'`      |
| 73  | The signature computed over an empty body          | builds the URL from the target and signs the body exactly as sent — 14 in all              | `expected 'v1,4UOUxKSd7PndJylh…' to be 'v1,ZmTzRPxqIlEYiJmV…'`                                          |
| 74  | One webhook-id for the whole case                  | gives every request its own webhook-id — 12 in all                                         | `expected 1 to be 4`                                                                                    |
| 75  | A replay rebuilt rather than resent                | replays an earlier request byte for byte                                                   | `expected 'msg_ee635cf5…' to be 'msg_ec07c6e0…'`                                                        |
| 76  | `omit` ignored                                     | applies each signing fault, and only that fault                                            | `expected true to be false`                                                                             |
| 77  | `timestampOffset` ignored                          | applies each signing fault…                                                                | `expected '1700000000' to be '1699999640'`                                                              |
| 78  | `tamper` applied before signing                    | applies each signing fault…                                                                | `expected 'v1,BBw2Cbmj…' to be 'v1,GRkbfUOe…'`                                                          |
| 79  | `wrongSecret` ignored                              | applies each signing fault…                                                                | `expected 'v1,FpSk2kaa…' not to be 'v1,FpSk2kaa…'`                                                      |
| 80  | References not remembered per label                | keeps one reference per label within a case                                                | `expected 'ref_f2e628b3…' to be 'ref_6f1601db…'`                                                        |
| 81  | Headers not redacted                               | shows allowlisted headers and hides the rest by value                                      | `expected 'secret-value' to be '•••'`                                                                   |
| 82  | The body limit not enforced                        | keeps no more than the body limit, and says it cut it                                      | `expected false to be true`                                                                             |
| 83  | A body that is not JSON kept as `null`             | keeps a body that is not JSON as text, and fails the case                                  | `expected { … } to match object { json: false, body: 'Not Found' }`                                     |
| 84  | Status not judged                                  | fails on a wrong status, and says which                                                    | `expected 'passed' to be 'failed'`                                                                      |
| 85  | A missing header not marked as missing             | reports a header the expectation names but the response lacks as missing                   | `expected [ { …(3) } ] to deeply equal [ { …(3) } ]`                                                    |
| 86  | The timeout only aborts, without the race          | is timed_out, not failed, when the partner does not answer in time                         | `Error: STACK_TRACE_ERROR` — vitest's own time limit: the case never returned                           |
| 87  | A timeout reported as an error                     | is timed_out, not failed…                                                                  | `expected 'error' to be 'timed_out'`                                                                    |
| 88  | An arrange failure ignored                         | is an error, and does not act, when an arrange step fails                                  | `expected 'passed' to be 'error'`                                                                       |
| 89  | The starting balance not checked to be an integer  | is an error when the starting balance of a writing case cannot be read                     | `expected 'failed' to be 'error'`                                                                       |
| 90  | Verify steps skipped                               | judges verify steps too: a right answer with a wrong balance afterwards fails              | `expected 'passed' to be 'failed'`                                                                      |
| 91  | The starting balance assumed to be 1,000, not read | all pass one after another against a single tenant                                         | `expected false to be true`                                                                             |

Row 91 is the reason that test exists. Run alone, each case gets a fresh
tenant at 1,000 points and an assumed starting balance is right by luck; only
the run that shares one tenant across every case shows that each case must
read its own.

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
