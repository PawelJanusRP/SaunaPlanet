// SP-042B — UI/action boundary contracts (owner decisions D1/D2/D3 and
// docs/SP042_FEEDBACK_ARCHITECTURE.md §12.3, §16, §17).

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), 'utf8')

const SAUNA_PAGE = read('app', '[locale]', 'sauna', '[id]', 'page.tsx')
const SAUNA_MAP = read('components', 'SaunaMap.tsx')
const BUTTON = read('components', 'feedback', 'FeedbackReportButton.tsx')
const ACTION = read('app', 'feedback', 'actions.ts')
const ADMIN_PAGE = read('app', '[locale]', '(main)', 'admin', 'page.tsx')

describe('facility detail entry (D1)', () => {
  it('the sauna detail page renders the correction entry with page-context identity', () => {
    expect(SAUNA_PAGE).toContain('FeedbackReportButton')
    expect(SAUNA_PAGE).toContain('saunaId={id}')
    // only active (public) facilities are reportable
    expect(SAUNA_PAGE).toMatch(/sauna\.status === 'active'[\s\S]{0,200}FeedbackReportButton/)
  })

  it('the SP-045 map popup does NOT gain the entry', () => {
    expect(SAUNA_MAP).not.toContain('FeedbackReportButton')
    expect(SAUNA_MAP).not.toContain("useTranslations('feedback')")
  })
})

describe('form component contracts', () => {
  it('ships a honeypot that humans never see', () => {
    expect(BUTTON).toMatch(/aria-hidden="true"[\s\S]{0,400}name="company_website"/)
    expect(BUTTON).toContain('tabIndex={-1}')
  })

  it('guards against double submit', () => {
    expect(BUTTON).toContain('if (saving) return')
    expect(BUTTON).toContain('disabled={saving}')
  })

  it('never hardcodes Polish copy — labels come from the feedback namespace', () => {
    expect(BUTTON).toContain("useTranslations('feedback')")
    expect(BUTTON).not.toMatch(/Zgłoś|Wyślij|Dziękujemy/)
  })

  it('shows the facility name for orientation but submits only the id', () => {
    expect(BUTTON).toContain('{saunaName}')
    const submitCall = BUTTON.slice(BUTTON.indexOf('submitFeedbackReport({'))
    const payload = submitCall.slice(0, submitCall.indexOf('})'))
    expect(payload).toContain('saunaId')
    expect(payload).not.toContain('saunaName')
  })
})

describe('server action contracts', () => {
  it('is RPC-only: never writes feedback tables directly', () => {
    expect(ACTION).toContain("rpc('submit_feedback_report'")
    expect(ACTION).not.toContain("from('feedback_reports')")
    expect(ACTION).not.toContain("from('feedback_correction_items')")
    expect(ACTION).not.toContain("from('feedback_report_events')")
  })

  it('derives identity from the session — no user id crosses the boundary', () => {
    expect(ACTION).toContain('auth.getUser()')
    expect(ACTION).not.toMatch(/p_user_id|p_created_by|userId\s*:/)
  })

  it('derives the anonymous key by HMAC from platform headers and fails closed', () => {
    expect(ACTION).toContain('createHmac')
    expect(ACTION).toContain('FEEDBACK_RATE_LIMIT_SECRET')
    expect(ACTION).toContain("h.get('x-real-ip')")
    expect(ACTION).toContain("h.get('x-forwarded-for')")
    // raw address is never persisted or forwarded — only the digest leaves scope
    expect(ACTION).toContain(".digest('hex')")
    expect(ACTION).not.toMatch(/console\.(log|error|warn)\([^)]*address/)
  })

  it('resolves the honeypot silently before any RPC call', () => {
    const trapIndex = ACTION.indexOf('input.trap')
    const rpcIndex = ACTION.indexOf("rpc('submit_feedback_report'")
    expect(trapIndex).toBeGreaterThan(-1)
    expect(trapIndex).toBeLessThan(rpcIndex)
    expect(ACTION).toMatch(/input\.trap[\s\S]{0,120}return \{ ok: true \}/)
  })
})

describe('admin visibility (read-only in SP-042B)', () => {
  it('the admin panel has the feedback tab backed by the moderation query', () => {
    expect(ADMIN_PAGE).toContain("from('feedback_reports')")
    expect(ADMIN_PAGE).toContain("activeTab === 'feedback'")
    expect(ADMIN_PAGE).toContain("t('tabs.feedback')")
  })

  it('exposes only an email-present indicator, never the address itself', () => {
    const section = ADMIN_PAGE.slice(
      ADMIN_PAGE.indexOf("activeTab === 'feedback'"),
      ADMIN_PAGE.indexOf('Submissions tab')
    )
    expect(section).toContain("tf('admin.hasEmail')")
    expect(section).not.toMatch(/\{r\.contact_email\}/)
  })

  it('ships no moderation controls yet (accept/reject/resolve are SP-042D)', () => {
    const section = ADMIN_PAGE.slice(
      ADMIN_PAGE.indexOf("activeTab === 'feedback'"),
      ADMIN_PAGE.indexOf('Submissions tab')
    )
    expect(section).not.toMatch(/<form|<button|action=/)
  })
})
