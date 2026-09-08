// SP-044 C2 — regression test for the demotion GUC-bypass fix.
// The hardened demotion trigger must NOT trust a client-settable GUC and must
// drive re-moderation purely from the professional-content field diff.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mig = readFileSync('supabase/2026-09-08_sp044_c2_demotion_hardening.sql', 'utf8')
const rb = readFileSync('supabase/2026-09-08_sp044_c2_demotion_hardening_rollback.sql', 'utf8')

describe('SP-044-C2 — demotion hardening', () => {
  it('requires the C1 GUC-based body as predecessor', () => {
    expect(mig).toContain("position('sp044.suppress_demotion' in v) = 0")
  })
  it('the hardened trigger no longer READS the client-settable GUC', () => {
    expect(mig).not.toContain("current_setting('sp044.suppress_demotion'")
  })
  it('display-identity fields (name, slug) are EXCLUDED from the demotion diff', () => {
    expect(mig).not.toContain('new.name is not distinct from old.name')
    expect(mig).not.toContain('new.slug is not distinct from old.slug')
  })
  it('professional-content fields still drive demotion (diff starts at city)', () => {
    expect(mig).toContain('if new.city is not distinct from old.city')
    expect(mig).toContain('new.bio is not distinct from old.bio')
    expect(mig).toContain("publication_status in ('published','legacy_published')")
  })
  it('owner-only gate preserved', () => {
    expect(mig).toContain('new.user_id <> auth.uid()')
  })
})

describe('SP-044-C2 — rollback', () => {
  it('restores the C1 GUC body and warns about the known defect', () => {
    expect(rb).toContain("current_setting('sp044.suppress_demotion'")
    expect(rb).toContain('new.name is not distinct from old.name')
    expect(rb).toContain('GUC-bypass defect')
  })
})
