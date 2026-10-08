# The page: brief and first mockups

Status: **a proposal**, not a decision. The mockups in [`mockups/`](mockups/) are static HTML
(open `run.html` and `results.html` in a browser, served over http so the fonts load) and are
not shipped. Direction chosen by the owner: **A**, the dashboard's visual system, with an
inspector-style result page.

## Who reads this page, and for how long

1. **An engineer looking at the portfolio**, two to five minutes. They will judge the suite
   from the result page, not from the home page: whether a verdict says what was wrong and
   shows the evidence, or only says "failed".
2. **A partner's developer** (the imagined real user), who needs to reproduce a failure. They
   need the exact request, the answer, and what was expected, in that order.

What both must get in under two minutes: press Try it, run a partner that is wrong in one
way, see a red case, open it, understand the mistake without reading the code, and see that
the suite put the points back.

## What the page is for, in one sentence per screen

- **Connection** (built): where the partner is and the one-time secret.
- **Run**: choose a partner version and services, press Run, watch three lanes.
- **Result**: one verdict, then the evidence for every case that did not pass.
- **History**: this session's runs, to compare versions.

## Principles, carried from the dashboard and kept

- **Status is read before text.** Pass, fail, timed out and waiting each have a colour, an
  icon and a word, never colour alone. Status colours are literals in both themes.
- **The accent must not compete with red and green**, so the accent is graphite (a neutral)
  and there is one primary button per view.
- **Machine output is monospace, what a person wrote is the UI face.** Case ids, paths,
  balances, durations and JSON are mono with tabular figures.
- **Tokens, not values.** Palette and type are variables generated from one table; the tests
  read the table.
- **Reasons are never only in a tooltip**; a touch screen has no hover.

## What is deliberately different from the dashboard

- **A type scale from the start**: 12, 13, 14, 16, 20, 28. The dashboard has fifteen sizes.
- **Two radii and a pill** (6 for controls, 10 for cards, a full pill for chips); the dashboard has eleven radii.
- **Status colour used as text is a themed token.** Found while checking the mockups: the
  literal green `#22c55e` and amber `#f59e0b` measure 2.05:1 and 1.96:1 as text on their own
  light-mode tint, short of AA for 12 px text. The fill and icon stay literal; the text uses
  `#166534` (6.43:1) and `#92400e` (6.46:1) in light mode. Dark mode passes as it is (6.24,
  5.60 and 6.55:1). The numbers were computed, not eyeballed.
- **Fonts are served from the page's own origin** (Manrope and JetBrains Mono, both OFL),
  because the page's content security policy allows nothing from another origin. The mockups
  load them from Google Fonts only because they are not production.

## The result page, as drawn

- A **verdict** first: "1 case failed", the counts, the version, the duration, and whether the
  points were given back. Then what to do next: run another version, run again.
- **Master and detail.** Cases are listed with the failures first, then each lane. The open
  case shows a sentence saying what did not match, with the formula and the values (`balance`
  should be the starting balance plus 100: 1,000 + 100 = 1,100; the partner answered 1,200),
  then its steps in the order the case runs them. Every step shows its **request body** and what
  came back. The steps that are judged (the act and the verify) are open: the request, then
  **Expected** and **Actual** side by side with the differing lines marked. The setup (reading the
  starting balance, and the arrange step that puts the partner in the state the case needs) is not
  judged, so it is collapsed into one line that opens to the same request and response.
- **A case that passed** (`mockups/passed.html`, drawn from `earn/adds-points`; 19 of 20 cases
  are in this state, so it is the common one). It opens with one sentence saying everything the
  case checks matched. Judged steps that matched are one line each (status, request line, time)
  and open to the same view as a failure: the request body, then **Expected** and **Actual** side
  by side, with a green bar on each field that matched. Expected is the expectation as the case
  states it, not a copy of the answer: `"balance"` reads `balance at start + 100 = 1,100` and
  `"transactionId"` reads `any non-empty string`, because the same object is both what is checked
  and what is shown. Fields in an answer that the case does not name are not checked, and the page
  says so. A matched step is collapsed by default but never removed: a developer comparing a pass
  with a failure needs the pass's request and answer, and a reader needs to see that the case did
  not pass by checking too little.
- **What setup is held to.** The starting balance read expects a status (`200`) and the arrange
  step expects any `2xx`; neither is judged on its body. If the arrange step does not answer 2xx the
  case ends as `error`, not `failed`, because nothing it then said about the partner would mean
  anything. (An earlier version of this brief said setup steps had no expectation at all. That was
  wrong: it was written from memory, and the recorded results of a real run show the status
  expectation on both.)
- **Headers are folded** and shown from an allowlist; the rest appear as names with the value
  hidden (`•••`).
- **The reveal** comes last: what was wrong with that version, which case catches it, and why
  only that one. It is written to be honest about the suite's limit: the other nineteen cases
  pass a partner with this bug.

## Found while reviewing the mockups

- **The first drawing was wrong in two ways, and the owner caught the larger one.** It left out
  the request bodies (a case is a request, and the request is what a partner's developer needs
  to reproduce it). It also drew the repeated earn as a step that matched, from memory of the
  case rather than from its definition. In `earn/duplicate-reference` the repeat is the judged
  step: it must return the first transaction's id and the balance plus 100, so the repeat fails
  on both, and the verify fails after it. The mockup now follows the definition in
  `packages/cases/src/cases/earn.ts`.

- **Phone width.** The mockup lists every case before the open one, so on a phone the evidence
  is a long scroll away. The build must put the first failed case's detail directly under the
  verdict at that width, and fold the passing cases into a closed section.
- **Narrow lane columns** broke case ids in the middle of a word. Ids now break only at the
  slash. Lanes stack below 1000 px.
- Looked at at 1280 and 375 px, dark and light; no horizontal scroll at 375. Not checked: a
  screen reader, keyboard order, or any browser but Chromium.

## Found while building the result page

- **Request signatures are shown in full.** The server's allowlist shows every `webhook-*` header,
  so `webhook-signature` appears as the HMAC it is, where the mockups drew `v1,•••`. It is not the
  secret; hiding it is a change to the allowlist, not to the page.
- **The numbers in the mockups were tidy.** A real run reads the starting balance after earlier cases
  in the same lane have moved it, so the repeat is expected to leave 1,200 and leaves 1,300.
- **The list of cases was laid out as a column of single letters** until the header's `nav` rule was
  scoped to the header: it had also applied to the list, which is a `<nav>` too. No test could see
  it, so a test now forbids laying anything out with a bare element selector.
- **The act and the verify disagree in the same words**, so each sentence of "what didn't match"
  names its step.
- **A run under a second says so** instead of "0 s".

## Found while building the Run page

- **The Run button sits below thirteen versions.** On a desktop screen the form is longer than the
  window, so the button is below the fold and the lanes appear beside a form that has scrolled
  away. The mockup showed five versions and "9 more". Not changed yet; the options are a scrolling
  list of versions, or the button repeated at the top of the form.
- **A run takes under two seconds locally**, so the running state goes past too quickly to see
  against `correct` or `double-earn`. Watching it takes `slow-balance`, whose cases time out.
- **"Points given back" was wrong when nothing had moved.** Against `slow-balance` every writing
  case times out before moving a point, and the summary still said the points were given back.
  It now says no points moved.

## Decided by the owner, and still open

1. **Hide the bug until the run ends?** Decided: no. Version names are shown, and the result says
   what was wrong. A "pick one for me" option that hides the name remains an idea, not built.
2. **Default version.** Decided: a wrong one is preselected (`double-earn`), so a first run shows a
   red case within a minute.
3. **History** is not drawn yet; it is a table of runs with the version and the counts. Still open.
