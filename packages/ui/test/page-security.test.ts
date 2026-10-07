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
