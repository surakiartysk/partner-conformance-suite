import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The page's content security policy has no 'unsafe-inline', so anything that
 * needs it would not run in production and would pass everywhere else. These
 * read the files that ship instead of trusting that nobody wrote one.
 */
const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name)
    return statSync(join(root, path)).isDirectory() ? sources(path) : [path]
  })
}

const policy = () => {
  const line = read('public/_headers')
    .split('\n')
    .find((l) => l.trim().startsWith('Content-Security-Policy:'))
  if (!line) throw new Error('public/_headers has no Content-Security-Policy')
  return Object.fromEntries(
    line
      .trim()
      .replace('Content-Security-Policy:', '')
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...values]) => [name, values]),
  ) as Record<string, string[]>
}

describe('the page headers', () => {
  it('allow scripts and styles from the page itself and nothing inline', () => {
    const csp = policy()
    expect(csp['script-src']).toEqual(["'self'"])
    expect(csp['style-src']).toEqual(["'self'"])
    expect(JSON.stringify(csp)).not.toMatch(/unsafe-|\*|https?:/)
  })

  it('start from nothing, and let the page talk only to its own origin', () => {
    const csp = policy()
    expect(csp['default-src']).toEqual(["'none'"])
    expect(csp['connect-src']).toEqual(["'self'"])
  })

  it('serve fonts and images from the page itself, so a font cannot come from elsewhere', () => {
    const csp = policy()
    expect(csp['font-src']).toEqual(["'self'"])
    expect(csp['img-src']).toEqual(["'self'", 'data:'])
  })

  it('refuse to be framed, and a base tag, and form posts', () => {
    const csp = policy()
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'none'"])
    expect(csp['form-action']).toEqual(["'none'"])
  })

  it('stop a browser guessing a content type', () => {
    expect(read('public/_headers')).toMatch(/X-Content-Type-Options:\s*nosniff/)
  })
})

describe('index.html', () => {
  const html = read('index.html')

  it('has no inline script and no inline style', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) expect(tag, tag).toMatch(/\bsrc=/)
    expect(html).not.toMatch(/<script\b[^>]*>\s*[^<\s]/) // a script with a body
    expect(html).not.toMatch(/<style\b/)
    expect(html).not.toMatch(/\sstyle=/)
    expect(html).not.toMatch(/\son[a-z]+=/)
  })
})

describe('the page source', () => {
  const files = sources('src').filter((f) => /\.(tsx?|css)$/.test(f))

  it('has files to look at', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('never puts text into the page as markup, or runs text as code', () => {
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      const code = read(file)
      expect(code, file).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML|insertAdjacentHTML/)
      expect(code, file).not.toMatch(/\beval\(|new Function\(/)
    }
  })

  it('sets no inline styles, which the policy would block', () => {
    for (const file of files.filter((f) => f.endsWith('.tsx'))) {
      expect(read(file), file).not.toMatch(/\bstyle=\{|\bstyle="/)
    }
  })

  it('reaches the network only through the API client', () => {
    for (const file of files.filter((f) => /\.tsx?$/.test(f) && !f.endsWith('api.ts'))) {
      expect(read(file), file).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/)
    }
  })

  it('loads nothing from another origin', () => {
    for (const file of files) {
      expect(read(file).replace(/\/\*[\s\S]*?\*\//g, ''), file).not.toMatch(
        /(?:src|href|url\()\s*=?\s*["']?https?:\/\//,
      )
    }
  })
})

describe('the stylesheet', () => {
  const css = () => read('src/styles.css')

  /**
   * Found in a browser, not by a test: the header's `nav { display: flex }` also
   * laid out the list of cases, which is a `<nav>` too, and put one letter of
   * each name on a line. A bare element selector reaches every element of that
   * kind on every page; layout belongs to a class or to something inside one.
   */
  it('lays nothing out with a bare element selector', () => {
    const rules = [
      ...css()
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/(^|\})\s*([a-z][a-z0-9]*)\s*\{([^}]*)\}/g),
    ]
    const offenders = rules
      .filter(([, , , body]) =>
        /(?<![\w-])(display|grid-template|flex|float|position)\s*:/.test(body!),
      )
      .map(([, , tag]) => tag)
    expect(offenders).toEqual([])
  })

  /**
   * The review of the page found text at 12 and 13 px nearly everywhere and body text at
   * 14. The sizes are a short list, and the text people read is the 15 px one.
   */
  it('sets the text people read at 15 px, and no size outside the scale', () => {
    const text = css()
    expect(text).toMatch(/body\s*\{[^}]*font:\s*400 15px/)
    const sizes = new Set([...text.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])))
    const scale = new Set([12, 13, 15, 16, 22, 28])
    expect([...sizes].filter((size) => !scale.has(size))).toEqual([])
  })

  /**
   * Spacing moves in 4 px steps, with 2 and 6 for the small things. The odd values that are
   * left (5, 7 and 11) are the padding a checked option gives up to its thicker border, so
   * the option keeps its size.
   */
  it('spaces things in the steps of the scale, and nothing else', () => {
    const allowed = new Set([0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 16, 20, 24, 28, 32, 64])
    const off: string[] = []
    for (const rule of css().matchAll(/(?:padding|margin|gap)[\w-]*:\s*([^;]+);/g)) {
      for (const px of rule[1]!.matchAll(/(-?\d+)px/g)) {
        if (!allowed.has(Math.abs(Number(px[1])))) off.push(rule[0])
      }
    }
    expect(off).toEqual([])
  })

  /**
   * Seen in a browser: the version select on the Connection page had the browser's own arrow, which
   * sat against the edge of its padding and looked adrift from the text. The arrow is drawn here, a
   * fixed distance from the right, with room left for it.
   */
  it('draws the select\u2019s arrow itself and leaves room for it', () => {
    const rule = /(?:^|\n)select \{([^}]*)\}/.exec(css())![1]!
    expect(rule).toMatch(/appearance:\s*none/)
    expect(rule).toMatch(/background-image:[^;]*linear-gradient/)
    expect(Number(/padding:\s*\d+px (\d+)px/.exec(rule)![1])).toBeGreaterThanOrEqual(28)
  })

  /** Seen in a browser: the lanes began against the buttons above them. */
  it('puts space above the lanes', () => {
    const rule = /\n\.lanes \{([^}]*)\}/.exec(css())![1]!
    expect(Number(/margin-top:\s*(\d+)px/.exec(rule)![1])).toBeGreaterThanOrEqual(12)
  })

  it('leaves the picture of a run out where its labels would be too small to read, and keeps the steps', () => {
    const rule = /@media \(max-width: 640px\) \{\s*\.figure \{([^}]*)\}/.exec(css())?.[1] ?? ''
    expect(rule).toMatch(/display:\s*none/)
    expect(css()).not.toMatch(/\.steps \{[^}]*display:\s*none/)
  })

  it('serves the specification as text, so the browser shows it and does not download it', () => {
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    expect(headers).toMatch(/\/openapi\.yaml\n\s+Content-Type: text\/plain; charset=utf-8/)
  })

  it('keeps the button of the form at the foot of the window', () => {
    expect(css()).toMatch(/\.run-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/)
  })

  it('makes the controls at least 44 px tall for a finger, and says so after the rule it overrides', () => {
    const text = css()
    const coarse = text.search(/@media \(pointer: coarse\)\s*\{[^}]*button[^}]*min-height:\s*44px/)
    expect(coarse).toBeGreaterThan(-1)
    // At equal specificity the later rule wins, so the rule for fingers must come after
    // every rule that sets a smaller minimum on the same controls. A real browser found
    // it above them, where it did nothing.
    const base = [
      ...text.matchAll(/(^|\n)(button|select|\.vopt|\.crow)\s*\{[^}]*min-height:\s*(\d+)px/g),
    ]
    expect(base.length).toBeGreaterThan(0)
    for (const rule of base) {
      expect(coarse, `after the ${rule[2]} rule that sets ${rule[3]}px`).toBeGreaterThan(
        rule.index!,
      )
    }
  })
})
