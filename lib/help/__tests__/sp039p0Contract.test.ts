// SP-039P0 — pilot polish and minimum saunamaster help: source contracts.
//
//  * B: the obsolete "claim page comes in a later stage" copy is gone;
//  * C: moderator guidance for `master_not_approved` (wording + real route,
//       no automatic approval, other result mappings preserved);
//  * D: the Studio first-steps card is derived, not stored;
//  * E: the public Quick Start page exists with the ten agreed sections;
//  * H: one central support copy, reused on every surface;
//  * I: no prohibited content (tokens, UUIDs, e-mails, analytics) in help.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SUPPORT_CHANNEL_PL,
  SUPPORT_SECURITY_WARNING_PL,
} from '../support'
import {
  MASTER_NOT_APPROVED_GUIDANCE_PL,
  PUBLICATION_STATUS_LABELS_PL,
} from '@/lib/master/publicationView'
import { PUBLICATION_TRANSITION_MESSAGES_PL } from '@/lib/master/publicationTransitions'

const pilotDetailPage = readFileSync('app/(main)/admin/masters/pilot/[id]/page.tsx', 'utf8')
const moderationControls = readFileSync('components/admin/PublicationModerationControls.tsx', 'utf8')
const adminPage = readFileSync('app/(main)/admin/page.tsx', 'utf8')
const studioPage = readFileSync('app/(main)/studio/page.tsx', 'utf8')
const firstStepsCard = readFileSync('components/studio/FirstStepsCard.tsx', 'utf8')
const onboarding = readFileSync('lib/master/onboarding.ts', 'utf8')
const helpPage = readFileSync('app/(main)/help/saunamaster/page.tsx', 'utf8')
const supportModule = readFileSync('lib/help/support.ts', 'utf8')
const supportNotice = readFileSync('components/help/SupportNotice.tsx', 'utf8')

describe('B — pilot invitation copy is current', () => {
  it('the obsolete "later stage" wording is absent', () => {
    for (const phrase of [
      'zostanie uruchomiona w kolejnym etapie',
      'w kolejnym etapie',
      'po jej wdrożeniu',
      'zacznie działać dopiero',
    ]) {
      expect(pilotDetailPage).not.toContain(phrase)
    }
  })
  it('the real claim flow is described instead', () => {
    expect(pilotDetailPage).toContain('publiczną stronę przejęcia profilu')
    expect(pilotDetailPage).toContain('loguje się lub zakłada konto')
    expect(pilotDetailPage).toContain('Przejęcie nie publikuje profilu')
    expect(pilotDetailPage).toContain('publiczny dopiero po zatwierdzeniu')
  })
  it('no internal implementation details leak into the copy', () => {
    // Code comments may reference RPCs; the rendered copy must not expose
    // token internals or database vocabulary.
    expect(pilotDetailPage).not.toMatch(/token_hash|raw_token|\bRLS\b/)
  })
})

describe('C — master_not_approved moderator guidance', () => {
  it('uses the approved Polish wording', () => {
    expect(MASTER_NOT_APPROVED_GUIDANCE_PL.message).toBe(
      'Najpierw zatwierdź profil saunamistrza. Publikacja wizytówki jest ' +
        'możliwa dopiero po zatwierdzeniu profilu podstawowego.'
    )
  })
  it('links to the real master-moderation route', () => {
    expect(MASTER_NOT_APPROVED_GUIDANCE_PL.actionHref).toBe('/admin?tab=masters')
    // The tab really exists in the admin shell.
    expect(adminPage).toContain("activeTab === 'masters'")
  })
  it('the controls show the guidance without approving the master automatically', () => {
    expect(moderationControls).toContain('MASTER_NOT_APPROVED_GUIDANCE_PL')
    expect(moderationControls).toContain("result.code === 'master_not_approved'")
    // No master-status mutation exists here: only the five M10 publication
    // actions are imported; nothing touches sauna_masters approval.
    expect(moderationControls).not.toMatch(/MasterModerationActions|updateMasterStatus/)
    expect(moderationControls).not.toContain("from('sauna_masters')")
  })
  it('the stable RPC result mapping is preserved', () => {
    expect(PUBLICATION_TRANSITION_MESSAGES_PL.master_not_approved).toBe(
      'Profil nie został jeszcze zatwierdzony przez moderację.'
    )
    expect(PUBLICATION_TRANSITION_MESSAGES_PL.profile_incomplete).toContain('niekompletny')
    expect(PUBLICATION_TRANSITION_MESSAGES_PL.reason_required).toBe(
      'Podaj uzasadnienie tej operacji.'
    )
  })
})

describe('D — first-steps card is derived, not persisted', () => {
  it('the studio dashboard renders the card for every owner branch', () => {
    // The card renders before any isApproved branching, so pending and
    // approved owners both get it; non-owners exit earlier via the notice.
    expect(studioPage).toContain('<FirstStepsCard')
    expect(studioPage.indexOf('<FirstStepsCard')).toBeLessThan(
      studioPage.indexOf('isApproved &&')
    )
    expect(studioPage).toContain('deriveFirstSteps')
    expect(studioPage).toContain('masterApproved: isApproved')
  })
  it('publication requirements come from the shared hard checklist', () => {
    expect(onboarding).toContain('HardChecklistItem')
    // No parallel completeness predicate: the module never inspects raw
    // profile fields (bio length, avatar url, …) on its own.
    expect(onboarding).not.toMatch(/BIO_MIN_LENGTH|avatarUrl|trim\(/)
  })
  it('no onboarding state is stored anywhere', () => {
    for (const src of [onboarding, firstStepsCard, studioPage]) {
      expect(src).not.toMatch(/localStorage|sessionStorage/)
      expect(src).not.toMatch(/onboarding_state|first_steps|\.insert\(|\.upsert\(/)
    }
  })
  it('the card links to the Quick Start page and shows no emoji state markers', () => {
    expect(firstStepsCard).toContain('href="/help/saunamaster"')
    expect(firstStepsCard).toContain('CircleCheck')
    expect(firstStepsCard).not.toMatch(/[✅⬜✓✗○◯]/)
  })
})

describe('E — public Quick Start page', () => {
  it('is public: no auth client, no redirect, no account data', () => {
    expect(helpPage).not.toMatch(/supabase|createClient|getUser|useAuth|redirect\(|cookies\(/i)
  })
  it('contains the ten agreed Polish sections', () => {
    for (const title of [
      'Jak przejąć profil',
      'Jak zalogować się lub założyć konto',
      'Jak wejść do Master Studio',
      'Jak uzupełnić wizytówkę',
      'Jak działa podgląd i publikacja',
      'Co oznaczają statusy moderacji',
      'Jak dodać wydarzenie',
      'obiekcie zarządzanym i niezarządzanym',
      'Jak uzyskać pomoc',
      'Zasady bezpieczeństwa',
    ]) {
      expect(helpPage).toContain(title)
    }
  })
  it('reuses the shared status vocabulary instead of inventing labels', () => {
    expect(helpPage).toContain('PUBLICATION_STATUS_LABELS_PL')
    expect(PUBLICATION_STATUS_LABELS_PL.submitted).toBe('Zgłoszony do moderacji')
  })
  it('tells the truth about the pilot: claim ≠ publish, no reservations, support-mediated event changes', () => {
    expect(helpPage).toContain('nie publikuje go')
    expect(helpPage).toContain('Rezerwacja miejsc')
    expect(helpPage).toContain('nie jest jeszcze dostępna')
    expect(helpPage).toContain('Korekta lub odwołanie aktywnego wydarzenia')
    expect(helpPage).toContain('tymczasowa procedura')
    // Internal backlog names never leak.
    expect(helpPage).not.toMatch(/\bG1\b|\bG2\b/)
  })
})

describe('H — one central support path', () => {
  it('the temporary channel points at the inviter and invents no address', () => {
    expect(SUPPORT_CHANNEL_PL).toContain('zaproszenie')
    expect(supportModule).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i)
    expect(supportModule).not.toMatch(/\+?\d{7,}/)
  })
  it('the mandatory security warning is exact', () => {
    expect(SUPPORT_SECURITY_WARNING_PL).toBe(
      'Nie wysyłaj hasła ani aktywnego linku do przejęcia profilu.'
    )
  })
  it('Quick Start and Studio render the SAME central copy', () => {
    expect(supportNotice).toContain("from '@/lib/help/support'")
    expect(helpPage).toContain('SupportNotice')
    expect(firstStepsCard).toContain('SupportNotice')
    // No surface duplicates the wording inline.
    for (const src of [helpPage, firstStepsCard]) {
      expect(src).not.toContain('Nie wysyłaj hasła')
    }
  })
})

describe('I — prohibited content in help surfaces', () => {
  const surfaces = [
    ['help page', helpPage],
    ['support module', supportModule],
    ['support notice', supportNotice],
    ['first-steps card', firstStepsCard],
    ['onboarding module', onboarding],
  ] as const

  it('no tokens, UUIDs, e-mails, credentials or analytics anywhere', () => {
    for (const [name, src] of surfaces) {
      expect(src, name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      expect(src, name).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}(?!\w)/i)
      expect(src, name).not.toMatch(/token_hash|raw_token|claim\/[A-Za-z0-9_-]{16,}/)
      expect(src, name).not.toMatch(/gtag|analytics|plausible|posthog|hotjar/i)
      expect(src, name).not.toMatch(/service_role/i)
    }
  })
})
