import type { CaseInfo, VersionInfo } from '../api'

interface Props {
  version: string
  info: VersionInfo | undefined
  cases: Map<string, CaseInfo>
  /** The ids of the cases this run planned, so the page does not claim a case ran that did not. */
  ran: Set<string>
}

/**
 * What was wrong with the version, and which cases catch it. Drawn from the
 * table in docs/variants.md; the other cases pass a partner with this bug, and
 * the page says so, because that is the suite's limit.
 */
export function VersionReveal({ version, info, cases, ran }: Props) {
  if (!info) return null
  if (info.bug === null) {
    return (
      <section className="card reveal" aria-labelledby="reveal">
        <h2 id="reveal">
          <span className="mono">{version}</span> is the correct partner
        </h2>
        <p className="note">
          Every case should pass against it. A suite that passes everything has shown that a correct
          partner is accepted, not that a wrong one would be caught: try a version that is wrong in
          one way.
        </p>
      </section>
    )
  }
  const others = cases.size - info.catches.length
  return (
    <section className="card reveal" aria-labelledby="reveal">
      <h2 id="reveal">
        What was wrong with <span className="mono">{version}</span>
      </h2>
      <p className="note">This version of the partner is correct except for one behaviour.</p>
      <dl>
        <dt>The bug</dt>
        <dd>{info.bug}</dd>
        <dt>Caught by</dt>
        <dd>
          <ul>
            {info.catches.map((id) => (
              <li key={id}>
                {cases.get(id)?.name ?? id} <span className="mono note">{id}</span>
                {ran.has(id) ? null : <span className="note"> — not part of this run</span>}
              </li>
            ))}
          </ul>
        </dd>
        <dt>The others</dt>
        <dd>
          The other {others} {others === 1 ? 'case passes' : 'cases pass'} a partner with this bug.
          A suite is only as good as the mistakes it has a case for.
        </dd>
      </dl>
    </section>
  )
}
