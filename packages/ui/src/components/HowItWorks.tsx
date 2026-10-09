/**
 * What this site does, in words and in a picture, for someone who has just landed on it and is
 * looking at a list of partner versions with planted bugs.
 *
 * The picture is a sequence of one run, and the same steps are written out beside it: the picture
 * is for looking, the list is what a screen reader reads and what can be copied. They are kept to
 * the same four steps, and a test holds the two to the same number.
 */

export const STEPS = [
  {
    title: 'Try it',
    text: 'The suite makes you a tenant on the sample partner: two test members with 1,000 points each, and a signing secret it keeps encrypted.',
  },
  {
    title: 'Run',
    text: 'You pick a version and the cases. The suite plans them into lanes.',
  },
  {
    title: 'Each case',
    text: 'Your browser asks a lane for its next case. The suite builds a request, signs it, sends it to the partner, judges the answer against what the case expects, and stores the result.',
  },
  {
    title: 'Give it back',
    text: 'When a lane that moved points is done, the suite puts the members back where they started, through the partner’s own API.',
  },
] as const

function Diagram() {
  // Three lifelines and the messages between them. Colours come from the stylesheet, so the
  // picture follows the theme, and the page's policy has no inline style to refuse.
  const LEFT = 90
  const MIDDLE = 360
  const RIGHT = 630
  const arrow = (y: number, from: number, to: number, label: string, kind = '') => (
    <g key={`${y}${label}`}>
      <line
        className={`dg-arrow ${kind}`}
        x1={from}
        y1={y}
        x2={to + (to > from ? -2 : 2)}
        y2={y}
        markerEnd="url(#dg-tip)"
      />
      <text className="dg-label" x={(from + to) / 2} y={y - 6} textAnchor="middle">
        {label}
      </text>
    </g>
  )
  return (
    <svg className="dg" viewBox="0 0 720 460" aria-hidden="true" focusable="false">
      <defs>
        <marker
          id="dg-tip"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path className="dg-tip" d="M0 0L10 5L0 10z" />
        </marker>
      </defs>
      {[
        [LEFT, 'Your browser'],
        [MIDDLE, 'The suite'],
        [RIGHT, 'The sample partner'],
      ].map(([x, name]) => (
        <g key={name}>
          <line className="dg-life" x1={x} y1={40} x2={x} y2={445} />
          <rect className="dg-box" x={Number(x) - 70} y={8} width={140} height={32} rx={6} />
          <text className="dg-name" x={x} y={29} textAnchor="middle">
            {name}
          </text>
        </g>
      ))}
      {arrow(80, LEFT, MIDDLE, '1 · Try it')}
      {arrow(110, MIDDLE, RIGHT, 'make a tenant and two members')}
      {arrow(160, LEFT, MIDDLE, '2 · Run: plan the lanes')}
      <rect className="dg-frame" x={30} y={190} width={660} height={190} rx={6} />
      <text className="dg-frame-label" x={42} y={208}>
        3 · for each case, in each lane
      </text>
      {arrow(238, LEFT, MIDDLE, 'ask for the next case')}
      {arrow(268, MIDDLE, RIGHT, 'a signed request')}
      {arrow(298, RIGHT, MIDDLE, 'the answer', 'dg-return')}
      {arrow(328, MIDDLE, LEFT, 'the verdict, stored', 'dg-return')}
      {arrow(410, MIDDLE, RIGHT, '4 · give the points back')}
      {arrow(440, MIDDLE, LEFT, 'the lane is done', 'dg-return')}
    </svg>
  )
}

export function HowItWorks() {
  return (
    <>
      <h1>How it works</h1>
      <p className="lede">
        This site checks a points API the way a client of it would: it sends signed requests and
        judges every answer. The API under test here is a sample built into the site, so you can see
        what the checks catch. Testing your own API is not available yet.
      </p>

      <section aria-labelledby="one-run">
        <h2 id="one-run">One run</h2>
        <figure className="figure">
          <Diagram />
          <figcaption className="note">
            One run, from pressing Try it to the points being given back. Solid arrows ask, dashed
            arrows answer.
          </figcaption>
        </figure>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <b>{step.title}.</b> {step.text}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="lanes">
        <h2 id="lanes">Lanes</h2>
        <p>
          Cases that only read run together in the read-only lane. Cases that change a
          member&rsquo;s points run one at a time in that member&rsquo;s lane, because two cases
          moving one balance at once would spoil each other&rsquo;s expected values. The lanes run
          side by side.
        </p>
      </section>

      <section aria-labelledby="partner">
        <h2 id="partner">The partner API</h2>
        <p>
          The sample partner is a points API: members and their balances, earning, redeeming and
          reversing points. Every request is signed with Standard Webhooks (HMAC-SHA256). The cases
          are checked against its specification, <a href="/openapi.yaml">openapi.yaml</a>. Each
          version other than <span className="mono">correct</span> breaks the spec in one way, and
          the result of a run says which case caught it.
        </p>
      </section>

      <section aria-labelledby="yours">
        <h2 id="yours">Yours alone</h2>
        <p>
          A session is yours for a day: its own tenant on the partner, its own two members and its
          own results. Every run is kept for the session and listed under History. From one address,
          five sessions an hour can be started, and a session can start twenty runs an hour.
        </p>
      </section>
    </>
  )
}
