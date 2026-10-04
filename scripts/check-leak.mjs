#!/usr/bin/env node
/**
 * Vocabulary tripwire.
 *
 * Everything in this repository is written from public standards and general
 * industry practice: the signing scheme is Standard Webhooks, errors are RFC
 * 9457, hosts are under the reserved `.example` TLD. This check keeps it that
 * way mechanically, because a rule nobody verifies decays.
 *
 * ## Why the words are not in this file
 *
 * A denylist in a published file publishes the list it exists to suppress. So
 * the terms live in `.leakwords.json`, which is gitignored and never committed.
 * What stays here are *structural* patterns — a JWT, a real-looking secret or
 * email address — because those describe shapes rather than names.
 *
 * Without that file the check still runs and still fails on structure, and it
 * says loudly that the word list is absent rather than passing in silence: a
 * tripwire that quietly checks nothing is worse than none.
 *
 * ## Matching
 *
 * Word terms are matched loosely. A bare `\bword\b` misses `wordService`,
 * `word_service` and `WordService`, which are the forms a word takes once it
 * reaches code. Each term is expanded to tolerate camelCase, snake_case,
 * kebab-case and any suffix. If a term fires on innocent code, narrow the term
 * rather than renaming the code.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'dist', 'build', '.pnpm'])

const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.md',
  '.html',
  '.css',
  '.sql',
  '.env',
  '.example',
])

/**
 * Turns a plain word into a pattern that survives the spellings code uses.
 *
 * Word characters are kept, any run of spaces, dashes or underscores between
 * them becomes "any separator or none", and the trailing `\b` is dropped so a
 * suffix cannot smuggle the word past. The leading boundary stays, so a short
 * term is not found inside an unrelated longer word.
 *
 * A term that is not plain words — a hex colour, something with punctuation —
 * is matched literally, because `\b` finds no boundary before `#` and the term
 * would silently match nothing.
 */
function looseWord(term) {
  const trimmed = term.trim()
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  if (!/^[\w\s_-]+$/.test(trimmed)) {
    return new RegExp(escape(trimmed), 'i')
  }

  const body = trimmed
    .split(/[\s_-]+/)
    .map(escape)
    .join('[-_ .]?')
  return new RegExp(`\\b${body}`, 'i')
}

/** Shape: { "terms": [{ "term": "...", "why": "..." }] }. Absent on a fresh clone. */
const WORDS_FILE = join(ROOT, '.leakwords.json')

function loadWordRules() {
  let raw
  try {
    raw = readFileSync(WORDS_FILE, 'utf8')
  } catch {
    return { rules: [], present: false }
  }

  const parsed = JSON.parse(raw)
  return {
    rules: parsed.terms.map(({ term, why }) => ({ pattern: looseWord(term), why })),
    present: true,
  }
}

const { rules: WORD_RULES, present: WORDS_PRESENT } = loadWordRules()

/** Structural rules — safe to publish, because they name shapes, not subjects. */
const STRUCTURAL = [
  // `anthropic.com` is exempt for the same reason `example.com` is: it cannot
  // be source material, and CLAUDE.md quotes the commit trailer that uses it.
  {
    pattern:
      /\b[A-Za-z0-9._%+-]+@(?!example\.(com|org)|anthropic\.com)[A-Za-z0-9.-]+\.(com|co\.th|io|net)\b/,
    why: 'real-looking email address',
  },
  {
    pattern:
      /\bhttps?:\/\/(?!127\.0\.0\.1|localhost|json\.schemastore\.org|github\.com|opensource\.org|www\.standardwebhooks\.com|www\.rfc-editor\.org)[a-z0-9.-]*(uat|sit|prod|internal|corp)[a-z0-9.-]*\b/i,
    why: 'non-public environment host',
  },
  { pattern: /\bBearer\s+eyJ[A-Za-z0-9_-]{10,}/, why: 'hardcoded JWT' },

  // A real secret reaching the repo. Development defaults say so in their own
  // value, so they do not match this.
  {
    pattern:
      /\b([A-Z_]*(SECRET|TOKEN|KEY))\s*=\s*["'](?!.*(?:dev-|your-|placeholder|test-))[^"']{12,}/,
    why: 'what looks like a real secret, not a development default',
  },
  // A Standard Webhooks secret with real entropy. The one published test
  // vector is allowed by value, because it is public and pinning it is the
  // point of the test that uses it.
  {
    pattern: /\bwhsec_(?!MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw\b)[A-Za-z0-9+/=]{24,}/,
    why: 'a signing secret with real entropy',
  },
]

const DENYLIST = [...WORD_RULES, ...STRUCTURAL]

/** This file spells out what it refuses, and the word list is the words. */
const EXEMPT = new Set(['scripts/check-leak.mjs', '.leakwords.json'])

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

const findings = []

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  if (EXEMPT.has(rel)) continue

  const ext = extname(file)
  const isDotfile = /^\.[a-z]/i.test(rel.split('/').pop() ?? '')
  if (!SCAN_EXTENSIONS.has(ext) && !isDotfile) continue

  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  for (const [index, line] of content.split('\n').entries()) {
    for (const { pattern, why } of DENYLIST) {
      const match = pattern.exec(line)
      if (match) findings.push({ file: rel, line: index + 1, term: match[0].trim(), why })
    }
  }
}

if (findings.length > 0) {
  console.error(`\n✖ check:leak — ${findings.length} finding(s)\n`)
  for (const { file, line, term, why } of findings) {
    console.error(`  ${file}:${line}`)
    console.error(`    matched: ${JSON.stringify(term)}  (${why})\n`)
  }
  console.error('If a pattern is over-broad, narrow it in scripts/check-leak.mjs.\n')
  process.exit(1)
}

if (!WORDS_PRESENT) {
  console.warn(`⚠ check:leak — structural rules only: ${relative(ROOT, WORDS_FILE)} not found.`)
  console.warn('  Vocabulary is NOT being checked. See the note at the top of this file.\n')
}

console.log(
  WORDS_PRESENT
    ? `✓ check:leak — clean (${WORD_RULES.length} vocabulary + ${STRUCTURAL.length} structural rules)`
    : `✓ check:leak — clean against ${STRUCTURAL.length} structural rules`,
)
