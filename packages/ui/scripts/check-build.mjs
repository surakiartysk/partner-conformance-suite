import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * What the build must not contain, because the page's policy would block it
 * and nothing else would notice.
 *
 * Vite turns a small asset into a `data:` URI inside the stylesheet. The
 * policy allows fonts only from the page's own origin (`font-src 'self'`), so
 * the browser refuses those fonts and says so in the console of whoever has it
 * open: found by reading that console, after the tests had passed. A `data:`
 * image is allowed (`img-src` has it, for the icon), so only fonts and anything
 * in a stylesheet or a script are looked for.
 */
export function findProblems(dist) {
  const problems = []
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
  for (const file of walk(dist)) {
    if (!/\.(css|js|html)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    if (/data:(font|application\/(font|x-font|vnd\.ms-fontobject))/i.test(text)) {
      problems.push(`${file}: a font inlined as a data: URI, which font-src 'self' refuses`)
    }
    if (/\.(css|js)$/.test(file) && /url\(\s*["']?data:(?!image\/)/i.test(text)) {
      problems.push(`${file}: a url(data:…) that is not an image`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = join(import.meta.dirname, '..', 'dist')
  const problems = findProblems(dist)
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('check:build — nothing the page policy would block')
}
