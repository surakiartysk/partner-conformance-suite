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
- **Two radii** (6 for controls, 10 for cards); the dashboard has eleven.
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

## Open questions for the owner

1. **Hide the bug until the run ends?** The mockup shows version names but not what is wrong
   with them, so the reveal is a reveal. A name like `double-earn` gives much of it away. An
   option would be "pick one for me", hiding the name until the result. It costs one more
   control and makes a repeat visit more interesting; it is not drawn.
2. **Default version.** Preselecting a wrong one makes the first run show red within a minute.
   Preselecting `correct` is the honest baseline but a first run that is all green teaches
   nothing. The mockup preselects `double-earn`.
3. **History** is not drawn yet; it is a table of runs with the version and the counts.
