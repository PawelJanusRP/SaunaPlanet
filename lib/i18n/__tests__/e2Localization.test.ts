// SP-047E2 — focused contracts for the final user-visible localization pass and
// the global Help hub/navigation. Catalog parity is enforced separately by
// catalogParity.test.ts; here we pin the presence of the new keys, the Help hub
// route, and the global Help menu entry.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../locales'

const cat = (locale: string, ns: string) =>
  JSON.parse(readFileSync(join('messages', locale, `${ns}.json`), 'utf8'))

function present(ns: string, get: (c: Record<string, unknown>) => unknown, label: string) {
  it(`${label} — present & non-empty in every locale`, () => {
    for (const locale of LOCALES) {
      const v = get(cat(locale, ns))
      expect(typeof v === 'string' ? v.length : Object.keys(v as object).length, `${locale}:${label}`).toBeGreaterThan(0)
    }
  })
}

describe('validation / profile presentation (common.validation)', () => {
  for (const code of ['name-empty', 'website-not-https', 'slug-too-short', 'year-future']) {
    present('common', (c) => (c.validation as Record<string, string>)[code], `validation.${code}`)
  }
})

describe('onboarding / completeness (studio)', () => {
  present('studio', (c) => (c.firstSteps as Record<string, unknown>).steps, 'firstSteps.steps')
  present('studio', (c) => (c.firstSteps as Record<string, unknown>).progress, 'firstSteps.progress')
  present('studio', (c) => c.completeness, 'completeness')
})

describe('pilot presentation labels (admin.pilot)', () => {
  present('admin', (c) => (c.pilot as Record<string, unknown>).readiness, 'pilot.readiness')
  present('admin', (c) => (c.pilot as Record<string, unknown>).invitationStatus, 'pilot.invitationStatus')
})

describe('publication-view labels (publication)', () => {
  present('publication', (c) => c.statusLabels, 'statusLabels')
  present('publication', (c) => c.statusHints, 'statusHints')
})

describe('help support (help.support)', () => {
  present('help', (c) => (c.support as Record<string, unknown>).heading, 'support.heading')
  present('help', (c) => (c.support as Record<string, unknown>).checklist, 'support.checklist')
})

describe('global Help hub + navigation', () => {
  it('the /help hub page exists and links to /help/saunamaster', () => {
    const page = 'app/[locale]/(main)/help/page.tsx'
    expect(existsSync(page)).toBe(true)
    const src = readFileSync(page, 'utf8')
    expect(src).toContain('/help/saunamaster')
    expect(src).toContain("getTranslations('help.hub')")
  })
  it('Help is a global drawer destination in the Navbar', () => {
    const navbar = readFileSync('components/Navbar.tsx', 'utf8')
    expect(navbar).toContain('href="/help"')
    expect(navbar).toContain("{t('help')}")
  })
  it('the /help route has a drawer icon', () => {
    expect(readFileSync('lib/navigation/icons.ts', 'utf8')).toContain("'/help': CircleHelp")
  })
  present('nav', (c) => c.help, 'nav.help')
  present('help', (c) => (c.hub as Record<string, unknown>).title, 'help.hub.title')
})
