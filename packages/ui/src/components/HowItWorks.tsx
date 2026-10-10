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
    text: 'The suite makes you a tenant on the sample partner: two test members with 1,000 points each, and a signing secret.',
  },
  {
    title: 'Run',
    text: 'You pick a version and the cases; the suite plans them into lanes.',
  },
  {
    title: 'Each case',
    text: 'Your browser asks a lane for its next case. The suite signs a request, sends it, judges the answer against what the case expects, and stores the result.',
  },
  {
    title: 'Give it back',
    text: 'When a lane that moved points is done, the suite puts the members back where they started.',
  },
] as const

function Diagram() {
  // Three lifelines and the messages between them. Colours come from the stylesheet, so the
  // picture follows the theme, and the page's policy has no inline style to refuse.
  //
  // The browser and the API under test are drawn side by side in one frame, "You, the partner":
  // in use they belong to the same company, which opens the suite and points it at its own API.
  // They used to sit at either end with the suite between, which read as two parties.
  const LEFT = 90
  const MIDDLE = 290
  const RIGHT = 610
  // Every message crosses the gap between the API and the suite, so every label sits there,
  // clear of the API's lifeline.
  const LABEL_X = (MIDDLE + RIGHT) / 2
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
      <text className="dg-label" x={LABEL_X} y={y - 6} textAnchor="middle">
        {label}
      </text>
    </g>
  )
  return (
    <svg className="dg" viewBox="0 0 720 454" aria-hidden="true" focusable="false">
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
      <g transform="translate(0 24)">
        <rect className="dg-frame" x={12} y={-18} width={358} height={64} rx={6} />
        <text className="dg-frame-label" x={22} y={-6}>
          You, the partner
        </text>
        {[
          [LEFT, 'Your browser'],
          [MIDDLE, 'Your API'],
          [RIGHT, 'The suite'],
        ].map(([x, name]) => (
          <g key={name}>
            <line className="dg-life" x1={x} y1={40} x2={x} y2={415} />
            <rect className="dg-box" x={Number(x) - 70} y={8} width={140} height={32} rx={6} />
            <text className="dg-name" x={x} y={29} textAnchor="middle">
              {name}
            </text>
          </g>
        ))}
        {arrow(80, LEFT, RIGHT, '1 · Try it')}
        {arrow(110, RIGHT, MIDDLE, 'make a tenant and two members')}
        {arrow(160, LEFT, RIGHT, '2 · Run: plan the lanes')}
        <rect className="dg-frame" x={30} y={190} width={660} height={150} rx={6} />
        <text className="dg-frame-label" x={42} y={208}>
          3 · for each case, in each lane
        </text>
        {arrow(238, LEFT, RIGHT, 'ask for the next case')}
        {arrow(268, RIGHT, MIDDLE, 'a signed request')}
        {arrow(298, MIDDLE, RIGHT, 'the answer', 'dg-return')}
        {arrow(328, RIGHT, LEFT, 'the verdict, stored', 'dg-return')}
        {arrow(374, RIGHT, MIDDLE, '4 · give the points back')}
        {arrow(404, RIGHT, LEFT, 'the lane is done', 'dg-return')}
      </g>
    </svg>
  )
}

export function HowItWorks() {
  return (
    <>
      <h1>How it works</h1>
      <p className="lede">
        This site sends signed requests to a points API and judges every answer, the way a client
        would. It is a simulation: the API here is a sample built into the site, so you can see what
        the checks catch. In real use, a partner gives the suite its own API&rsquo;s address.
      </p>

      <section aria-labelledby="one-run">
        <h2 id="one-run">One run</h2>
        <figure className="figure">
          <Diagram />
          <figcaption className="note">
            Solid arrows ask, dashed arrows answer. In real use, the browser and the API are the
            same partner&rsquo;s: it opens the suite and points it at its own API. Here it is
            simulated, and a sample partner stands in for yours, one bug planted in each version.
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
          Cases that only read share one lane. Cases that change a member&rsquo;s points run one at
          a time in that member&rsquo;s lane, so two of them never move one balance at once. The
          lanes run side by side.
        </p>
      </section>

      <section aria-labelledby="partner">
        <h2 id="partner">The partner API</h2>
        <p>
          The sample partner is a points API: balances, earning, redeeming and reversing. Requests
          are signed with Standard Webhooks and checked against its specification,{' '}
          <a href="/openapi.yaml">openapi.yaml</a>. Each version other than{' '}
          <span className="mono">correct</span> breaks the spec in one way; the result says which
          case caught it. What a partner implements, with a signed request worked through, is under{' '}
          <a href="/for-partners">For partners</a>.
        </p>
      </section>

      <section aria-labelledby="yours">
        <h2 id="yours">Yours alone</h2>
        <p>
          A session is yours for a day, with its own tenant, members and results; every run stays
          under History. Five sessions an hour can be started from one address, and a session can
          start twenty runs an hour.
        </p>
      </section>
    </>
  )
}
