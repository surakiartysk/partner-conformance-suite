import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain script, with no types of its own
import { findProblems } from '../scripts/check-build.mjs'

function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'))
  mkdirSync(join(dir, 'assets'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

describe('what the build must not contain', () => {
  it('finds nothing in a build with files for its fonts', () => {
    const d = dist({
      'index.html': '<link rel="icon" href="data:image/svg+xml,<svg/>">',
      'assets/a.css': '@font-face{src:url(/assets/m.woff2) format("woff2")}',
      'assets/a.js': 'console.log("hi")',
    })
    expect(findProblems(d)).toEqual([])
  })

  it('finds a font inlined as a data: URI, in a stylesheet', () => {
    const d = dist({
      'assets/a.css': '@font-face{src:url(data:font/woff2;base64,AAAA) format("woff2")}',
    })
    expect(findProblems(d)).toHaveLength(2) // as a font, and as a url() that is not an image
    expect(findProblems(d)[0]).toContain('a font inlined as a data: URI')
  })

  it('finds a font inlined in a script, and in the page', () => {
    expect(findProblems(dist({ 'assets/a.js': 'x="data:font/woff2;base64,AAAA"' }))).toHaveLength(1)
    expect(
      findProblems(
        dist({ 'index.html': '<style>@font-face{src:url(data:font/woff;base64,A)}</style>' }),
      ),
    ).toHaveLength(1)
  })

  it('finds an old font type too', () => {
    expect(
      findProblems(dist({ 'assets/a.js': 'data:application/x-font-ttf;base64,AA' })),
    ).toHaveLength(1)
  })

  it('finds a url(data:) that is not an image, and lets an image through', () => {
    expect(
      findProblems(dist({ 'assets/a.css': 'a{background:url(data:text/plain,hi)}' })),
    ).toHaveLength(1)
    expect(
      findProblems(dist({ 'assets/a.css': 'a{background:url(data:image/png;base64,AA)}' })),
    ).toEqual([])
  })

  it('looks in the folders below the top', () => {
    const d = dist({})
    mkdirSync(join(d, 'assets', 'deep'))
    writeFileSync(join(d, 'assets', 'deep', 'b.css'), 'src:url(data:font/woff2;base64,A)')
    expect(findProblems(d).length).toBeGreaterThan(0)
  })
})
