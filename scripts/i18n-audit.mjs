// SP-047 — hardcoded user-facing Polish string audit.
//
// Static audit (NOT a build gate): scans TSX/TS under app/ and components/ for
// string literals that still contain Polish text, so the remaining
// localization work is visible and no surface is accidentally Polish-only.
//
// Deliberately conservative: it flags string literals containing Polish
// diacritics, and skips comments, imports, and non-user-facing technical
// strings. It does NOT scan tests, docs, DB seed data, message catalogs, or
// user-content examples.
//
// Usage:  node scripts/i18n-audit.mjs            (summary)
//         node scripts/i18n-audit.mjs --list     (every hit with file:line)

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const LIST = process.argv.includes('--list')

const files = execSync('git ls-files "app/**/*.tsx" "app/**/*.ts" "components/**/*.tsx"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

// Polish-specific letters — a strong signal of untranslated UI copy.
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/

// Strip block and line comments so documentation notes are not flagged.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// Match single/double/backtick string literals.
const STRING_RE = /(['"`])((?:\\.|(?!\1).)*)\1/g

const results = []
for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const src = stripComments(raw)
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    // Skip obvious non-UI lines.
    if (/^\s*(import|export\s+\{|\/\/)/.test(line)) return
    let m
    STRING_RE.lastIndex = 0
    while ((m = STRING_RE.exec(line))) {
      const value = m[2]
      if (POLISH.test(value)) {
        results.push({ file, line: i + 1, value: value.slice(0, 80) })
      }
    }
  })
}

const byFile = new Map()
for (const r of results) byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1)

console.log(`SP-047 hardcoded Polish-string audit`)
console.log(`Scanned ${files.length} files; ${results.length} hits in ${byFile.size} files.\n`)

const sorted = [...byFile.entries()].sort((a, b) => b[1] - a[1])
for (const [file, count] of sorted) {
  console.log(`  ${count.toString().padStart(3)}  ${file}`)
}

if (LIST) {
  console.log('\n--- details ---')
  for (const r of results) console.log(`${r.file}:${r.line}  ${JSON.stringify(r.value)}`)
}

// Non-zero exit only in --list mode is intentionally avoided: this is a
// reporting tool, so it always exits 0. Wire it into CI as a threshold later.
