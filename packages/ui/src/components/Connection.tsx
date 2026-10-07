import type { SessionView } from '../api'
import { points, timeLeft } from '../format'

interface Props {
  session: SessionView
  /** The version whose address is shown. */
  version: string
  onVersion: (version: string) => void
  /** The signing secret, once this page has been shown it; never kept anywhere else. */
  secret: string | null
  /** A message to show beside the secret button, when asking for it failed. */
  secretProblem: string | null
  onReveal: () => void
  revealing: boolean
  onRefresh: () => void
  onContinue: () => void
  refreshing: boolean
  now: number
}

export function Connection(props: Props) {
  const { session, version, secret, now } = props
  const address = session.partner.baseUrls[version]
  return (
    <>
      <h1>Connection</h1>
      <p className="lede">
        This session ends in {timeLeft(session.expiresAt, now)}. Everything below belongs to it
        alone.
      </p>

      <section aria-labelledby="where">
        <h2 id="where">The partner</h2>
        <label className="field">
          <span>Version</span>
          <select value={version} onChange={(event) => props.onVersion(event.target.value)}>
            {session.partner.versions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p className="mono block" aria-label="Address">
          {address}
        </p>
        <p className="note">
          This is the address the suite builds for each request. Requests reach the partner through
          a service binding, not over the public internet, so it is a name the partner knows itself
          by and not a URL you can open.
        </p>
      </section>

      <section aria-labelledby="secret">
        <h2 id="secret">Signing secret</h2>
        <p>
          Every request is signed with it (Standard Webhooks, HMAC-SHA256). The suite keeps it
          encrypted and shows it once.
        </p>
        {secret !== null ? (
          <>
            <p className="mono block" aria-label="Signing secret">
              {secret}
            </p>
            <p className="note">This is the only time it is shown. Reloading the page loses it.</p>
          </>
        ) : session.secret.revealed ? (
          <p className="note">It has been shown once. Start a new session to see another.</p>
        ) : (
          <button type="button" onClick={props.onReveal} disabled={props.revealing}>
            {props.revealing ? 'Showing…' : 'Show the secret once'}
          </button>
        )}
        {props.secretProblem ? (
          <p role="alert" className="problem">
            {props.secretProblem}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="members">
        <h2 id="members">Test members</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Member</th>
              <th scope="col" className="num">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {session.members.map((member) => (
              <tr key={member.slot}>
                <th scope="row">{member.slot}</th>
                <td className="mono">{member.id}</td>
                <td className="num">
                  {typeof member.balance === 'number' ? points(member.balance) : 'not available'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={props.onRefresh} disabled={props.refreshing}>
          {props.refreshing ? 'Reading…' : 'Read the balances again'}
        </button>
      </section>

      <div className="actions">
        <button type="button" className="primary" onClick={props.onContinue}>
          Continue to Run
        </button>
      </div>
    </>
  )
}
