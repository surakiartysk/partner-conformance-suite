# The reference partner's versions

The reference partner is served as nine versions. `correct` implements the
spec; each of the others is `correct` with **one** behaviour switched off, so a
case that goes red points at one cause.

This file is read by `packages/api/test/variants.test.ts`, which runs every
case against every version and compares what happens with the tables below —
in both directions. A case that goes red where it should not is a case that
depends on something it should not; a case that stays green where it should go
red is a case that does not check what it claims. Neither is fixed by editing
the table to match: find out why first.

Each case runs on a tenant of its own, so one case cannot change what another
sees.

## What each version does wrong, and what must go red

| Version             | The bug                                                                     | Status      | Cases that must not pass                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correct`           | none                                                                        | —           | none                                                                                                                                                                                                                                                              |
| `ignores-signature` | never checks the signature, so a missing, wrong or tampered one is accepted | `failed`    | `security/missing-signature`, `security/wrong-signature`, `security/tampered-body`                                                                                                                                                                                |
| `accepts-stale`     | checks the signature but not the timestamp                                  | `failed`    | `security/stale-timestamp`                                                                                                                                                                                                                                        |
| `no-replay-guard`   | does not remember the `webhook-id`s it has accepted                         | `failed`    | `security/replayed-request`                                                                                                                                                                                                                                       |
| `double-earn`       | ignores `reference` on an earn, so a repeated earn adds the points again    | `failed`    | `earn/duplicate-reference`                                                                                                                                                                                                                                        |
| `overdraws`         | lets a redemption take the balance below zero                               | `failed`    | `redeem/over-balance`                                                                                                                                                                                                                                             |
| `double-reversal`   | lets one transaction be reversed more than once                             | `failed`    | `reversal/twice`                                                                                                                                                                                                                                                  |
| `plain-errors`      | answers an unknown member as plain text, not an RFC 9457 problem            | `failed`    | `member/unknown`, `earn/unknown-member`                                                                                                                                                                                                                           |
| `slow-balance`      | takes longer than the runner's timeout to answer a balance read             | `timed_out` | `member/balance`, `security/tampered-body`, `earn/adds-points`, `earn/duplicate-reference`, `earn/invalid-points`, `redeem/takes-points`, `redeem/over-balance`, `redeem/duplicate-reference`, `redeem/negative-points`, `reversal/undoes-earn`, `reversal/twice` |

`slow-balance` is wide on purpose. Everything that moves points reads the
balance first, so a partner whose balance read hangs cannot be tested for any
of it — and the right answer is `timed_out` on each, not `failed`: the partner
did not answer, which is a different thing from answering wrongly. Its cases
are `member/balance` and the ten cases that declare `writes`; the test holds
the list to that, so it cannot quietly stop being true.

## Cases no version makes fail

A case that no version of the partner can make fail has never been shown to
catch anything. These are not covered yet, and this list is held to the code:
the test fails if a case on it turns out to be covered, and fails if a new case
is neither covered nor listed here.

- `security/valid-signature` — a control, not a check. Its job is to pass, so
  that a partner refusing every request cannot pass the cases that expect a
  refusal.
- `member/known`
- `member/balance`
- `earn/adds-points`
- `earn/invalid-points`
- `redeem/takes-points`
- `redeem/duplicate-reference`
- `redeem/negative-points`
- `reversal/undoes-earn`
- `reversal/unknown-transaction`
