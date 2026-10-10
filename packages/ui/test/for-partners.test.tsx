import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CASES, type RequestSpec } from '../../cases/src'
import { ForPartners } from '../src/components/ForPartners'
import { EXAMPLE, OPERATIONS } from '../src/contract'

/**
 * The For partners page says what the contract says, and its worked example is
 * a request that verifies.
 */
const html = renderToStaticMarkup(<ForPartners />)
const spec = readFileSync(new URL('../../spec/openapi.yaml', import.meta.url), 'utf8')

/** Every operation in the spec, read from its own lines: path, method, summary, statuses. */
function specOperations() {
  const paths = spec.slice(spec.indexOf('\npaths:\n'), spec.indexOf('\ncomponents:\n'))
  return [...paths.matchAll(/\n {2}(\/\S+):\n([\s\S]*?)(?=\n {2}\/|$)/g)].map(([, path, body]) => ({
    method: /\n {4}(get|post|put|patch|delete):/.exec(body!)![1]!.toUpperCase(),
    path: path!,
    summary: /\n {6}summary: (.+)/.exec(body!)![1]!,
    statuses: [...body!.matchAll(/\n {8}'(\d{3})':/g)].map((m) => Number(m[1])),
  }))
}

describe('the For partners page', () => {
  it('lists exactly the operations the spec has, each with its method, summary and statuses', () => {
    const found = specOperations()
    expect(found).toHaveLength(5)
    expect(OPERATIONS.map((op) => ({ ...op }))).toEqual(found)
  })

  it('draws a row for every operation', () => {
    for (const op of OPERATIONS) {
      expect(html).toContain(`<th scope="row" class="mono">${op.method} ${op.path}</th>`)
      expect(html).toContain(`<td class="mono">${op.statuses.join(' ')}</td>`)
    }
  })

  it('says the partner here is simulated, and that in real use it gives its own address', () => {
    expect(html).toContain('On this site the partner is simulated')
    expect(html).toContain('In real use, a partner gives the suite its own API’s address')
    expect(html).toContain('<a href="/openapi.yaml">openapi.yaml</a>')
  })

  it('gives a worked request whose signature is right, recomputed without the suite or the partner', () => {
    const key = Buffer.from(EXAMPLE.secret.slice('whsec_'.length), 'base64')
    const content = `${EXAMPLE.id}.${EXAMPLE.timestamp}.${EXAMPLE.body}`
    expect(`v1,${createHmac('sha256', key).update(content).digest('base64')}`).toBe(
      EXAMPLE.signature,
    )
  })

  it('puts the example secret in a block that can break, since it has no space to break at', () => {
    expect(html).toContain(
      `<p class="mono block" aria-label="The example secret">${EXAMPLE.secret}</p>`,
    )
  })

  it('shows the worked request whole: the three headers and the body exactly as signed', () => {
    const block = /<pre class="json block" aria-label="A signed request">([\s\S]*?)<\/pre>/.exec(
      html,
    )![1]!
    const text = block.replace(/&quot;/g, '"')
    expect(text).toContain(`webhook-id: ${EXAMPLE.id}`)
    expect(text).toContain(`webhook-timestamp: ${EXAMPLE.timestamp}`)
    expect(text).toContain(`webhook-signature: ${EXAMPLE.signature}`)
    expect(text.endsWith(`\n\n${EXAMPLE.body}`)).toBe(true)
  })

  it('walks through a case that exists, as the case sends it', () => {
    const adds = CASES.find((c) => c.id === 'earn/adds-points')!
    expect(html).toContain('<span class="mono">earn/adds-points</span>')
    expect(adds.writes).toBe(true)
    const ctx = { member: { id: 'mbr_a' }, ref: () => 'ref_1' } as never
    const act = adds.act.request(ctx) as RequestSpec
    expect([act.method, act.path, (act.body as { points: number }).points]).toEqual([
      'POST',
      '/points/earn',
      100,
    ])
    expect(adds.verify?.map((step) => (step.request(ctx) as RequestSpec).path)).toEqual([
      '/members/mbr_a/balance',
    ])
    expect(html).toContain('<span class="mono">POST /points/earn</span> with 100 points')
  })
})
