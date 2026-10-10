import { EXAMPLE, OPERATIONS } from '../contract'

/**
 * What a partner implements to be tested, and what the suite sends it.
 *
 * Until this page the contract was `openapi.yaml`, which a browser shows as
 * plain text, and the only way to see a request was to run a case and open its
 * result. Here it is read before anything is run: the five operations, how a
 * request is signed, one signed request whole, and the requests of one case in
 * order.
 */
export function ForPartners() {
  return (
    <>
      <h1>For partners</h1>
      <p className="lede">
        What a partner implements to be tested by this suite. On this site the partner is simulated:
        a sample built into the site, which the suite sends its requests to. In real use, a partner
        gives the suite its own API&rsquo;s address and signing secret, and the same cases are sent
        there.
      </p>

      <section aria-labelledby="operations">
        <h2 id="operations">Five operations</h2>
        <p>
          Every request comes from the suite and every answer goes back to it; the partner never
          calls the suite. The full contract is <a href="/openapi.yaml">openapi.yaml</a>.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">What it does</th>
              <th scope="col">Answers</th>
            </tr>
          </thead>
          <tbody>
            {OPERATIONS.map((op) => (
              <tr key={op.path}>
                <th scope="row" className="mono">
                  {op.method} {op.path}
                </th>
                <td>{op.summary}</td>
                <td className="mono">{op.statuses.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          Points move only through earn, redeem and reversals, and each carries a{' '}
          <span className="mono">reference</span>: the same reference with the same body returns the
          first result and moves nothing more; with a different body it is refused with 409. Every
          error is an RFC 9457 problem document.
        </p>
      </section>

      <section aria-labelledby="signing">
        <h2 id="signing">Signing</h2>
        <p>
          Every request carries three headers, following Standard Webhooks:{' '}
          <span className="mono">webhook-id</span>, <span className="mono">webhook-timestamp</span>{' '}
          (Unix seconds) and <span className="mono">webhook-signature</span>. The signature is
          HMAC-SHA256 over <span className="mono">id.timestamp.body</span>, under the key that
          follows <span className="mono">whsec_</span> in the secret, written as{' '}
          <span className="mono">v1,</span> and the base64 result.
        </p>
        <p>A partner refuses, and changes nothing:</p>
        <ul className="steps">
          <li>a request with no signature, or none that verifies: 401</li>
          <li>a timestamp more than five minutes from its own clock, either way: 401</li>
          <li>
            a <span className="mono">webhook-id</span> it has already accepted: 409. It remembers an
            id for at least ten minutes.
          </li>
        </ul>
      </section>

      <section aria-labelledby="example">
        <h2 id="example">One request, signed</h2>
        <p>
          An earn of 100 points, signed with the secret Standard Webhooks publishes for its own test
          vector. Check a verifier against it.
        </p>
        {/* A block, not an inline span: the secret has no place to break, and inline it ran 42px
            past a 320px screen. */}
        <p className="mono block" aria-label="The example secret">
          {EXAMPLE.secret}
        </p>
        <pre className="json block" aria-label="A signed request">
          {[
            'POST /points/earn',
            'content-type: application/json',
            `webhook-id: ${EXAMPLE.id}`,
            `webhook-timestamp: ${EXAMPLE.timestamp}`,
            `webhook-signature: ${EXAMPLE.signature}`,
            '',
            EXAMPLE.body,
          ].join('\n')}
        </pre>
        <p className="note">
          The signed content is the id, the timestamp and the body exactly as sent, joined by dots.
          A real request carries the time it was signed, so this one would be refused as stale.
        </p>
      </section>

      <section aria-labelledby="one-case">
        <h2 id="one-case">What one case sends</h2>
        <p>
          The case <span className="mono">earn/adds-points</span>, against member A:
        </p>
        <ol className="steps">
          <li>
            <span className="mono">GET /members/mbr_a/balance</span>: the balance before, which
            every expectation after it is measured from.
          </li>
          <li>
            <span className="mono">POST /points/earn</span> with 100 points and a new reference:
            expects 200, type <span className="mono">earn</span>, 100 points, and the balance before
            plus 100.
          </li>
          <li>
            <span className="mono">GET /members/mbr_a/balance</span>: expects that same balance,
            read back.
          </li>
          <li>
            When the member&rsquo;s lane is done, the suite gives the 100 points back with an
            ordinary redemption.
          </li>
        </ol>
        <p className="note">
          After a run, each case&rsquo;s result shows every request it sent, the answer, and what
          was expected.
        </p>
      </section>
    </>
  )
}
