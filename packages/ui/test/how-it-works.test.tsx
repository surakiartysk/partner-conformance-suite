import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HowItWorks, STEPS } from '../src/components/HowItWorks'

const html = renderToStaticMarkup(<HowItWorks />)

describe('the How it works page', () => {
  it('has one h1 and the sections a newcomer asks about, each a named section', () => {
    expect(html.match(/<h1>/g)).toHaveLength(1)
    for (const heading of ['One run', 'Lanes', 'The partner API', 'Yours alone']) {
      expect(html).toContain(`>${heading}</h2>`)
    }
    expect(html.match(/<section aria-labelledby="[a-z-]+">/g)).toHaveLength(4)
  })

  it('says at the top that the API under test is a sample and that testing your own is not there yet', () => {
    expect(html).toContain('a sample built into the site')
    expect(html).toContain('Testing your own API is not available yet')
  })

  it('links to the partner API specification on its own origin', () => {
    expect(html).toContain('<a href="/openapi.yaml">openapi.yaml</a>')
  })

  it('draws the run as a picture that is hidden from a screen reader, and writes the same steps as a list', () => {
    expect(html).toMatch(/<svg class="dg"[^>]*aria-hidden="true"/)
    const items = html.match(/<ol class="steps">([\s\S]*?)<\/ol>/)![1]!
    expect(items.match(/<li>/g)).toHaveLength(STEPS.length)
    for (const step of STEPS) expect(items).toContain(`<b>${step.title}.</b>`)
  })

  it('numbers the diagram with the same number of steps as the list', () => {
    const numbered = html.match(/>([1-9]) · [^<]+</g) ?? []
    expect(numbered.map((n) => n[1])).toEqual(['1', '2', '3', '4'])
    expect(numbered).toHaveLength(STEPS.length)
  })

  it('has three lifelines named for who they are, and nothing inline that the page policy would refuse', () => {
    for (const name of ['Your browser', 'The suite', 'The sample partner'])
      expect(html).toContain(`>${name}</text>`)
    expect(html).not.toMatch(/ style="/)
  })

  it('has a caption that says what a solid and a dashed arrow mean', () => {
    expect(html).toMatch(/<figcaption[^>]*>[^<]*Solid arrows ask, dashed arrows answer/)
  })
})

/**
 * The page states two limits and a lifetime. They are numbers in the API, and a page that says
 * "five an hour" while the API says ten is wrong in the one place a visitor looks. Read from the
 * API's own source, as the variants table is held to its document.
 */
describe('what the page says about limits', () => {
  const api = (file: string) =>
    readFileSync(new URL(`../../api/src/${file}`, import.meta.url), 'utf8')
  const constant = (file: string, name: string) =>
    Number(
      new RegExp(`export const ${name} = ([0-9 *]+)`)
        .exec(api(file))![1]!
        .split('*')
        .reduce((n, x) => n * Number(x), 1),
    )
  const words: Record<number, string> = { 5: 'five', 10: 'ten', 20: 'twenty' }
  const text = html.replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’')

  it('says a session lasts a day, as long as the partner keeps a tenant', () => {
    const lifetime = readFileSync(
      new URL('../../partner/src/provision.ts', import.meta.url),
      'utf8',
    )
    expect(/TENANT_LIFETIME_SECONDS = 24 \* 60 \* 60/.test(lifetime)).toBe(true)
    expect(text).toContain('A session is yours for a day')
  })

  it('are the API’s own: sessions started, runs started, and the hour they are counted over', () => {
    expect(constant('sessions.ts', 'SESSION_START_WINDOW_SECONDS')).toBe(3600)
    expect(constant('runs.ts', 'RUN_WINDOW_SECONDS')).toBe(3600)
    const sessions = constant('sessions.ts', 'SESSION_STARTS_ALLOWED')
    const runs = constant('runs.ts', 'RUNS_ALLOWED')
    expect(text).toContain(`${words[sessions]} sessions an hour can be started`)
    expect(text).toContain(`a session can start ${words[runs]} runs an hour`)
  })
})
