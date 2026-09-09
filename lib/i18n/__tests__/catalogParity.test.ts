// SP-047 — catalog parity gate. Every supported locale must expose the SAME
// key structure across every namespace, so a missing/extra translation can
// never ship silently. Structural recursive comparison (not a hand-maintained
// list), with Polish as the reference catalog.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALES, DEFAULT_LOCALE } from '../locales'
import { NAMESPACES } from '../messages'

/** Recursively collect dotted key paths (objects only; leaves are strings). */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [prefix]
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out.push(...keyPaths(v, prefix ? `${prefix}.${k}` : k))
  }
  return out.sort()
}

function loadCatalog(locale: string, ns: string): Record<string, unknown> {
  const path = join('messages', locale, `${ns}.json`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('catalog files exist for every locale/namespace', () => {
  for (const locale of LOCALES) {
    for (const ns of NAMESPACES) {
      it(`${locale}/${ns}.json exists`, () => {
        expect(existsSync(join('messages', locale, `${ns}.json`))).toBe(true)
      })
    }
  }
})

describe('every namespace has identical key structure across locales', () => {
  for (const ns of NAMESPACES) {
    const reference = keyPaths(loadCatalog(DEFAULT_LOCALE, ns))
    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue
      it(`${locale}/${ns} matches ${DEFAULT_LOCALE}/${ns}`, () => {
        const actual = keyPaths(loadCatalog(locale, ns))
        const missing = reference.filter((k) => !actual.includes(k))
        const extra = actual.filter((k) => !reference.includes(k))
        expect({ missing, extra }).toEqual({ missing: [], extra: [] })
      })
    }
  }
})
