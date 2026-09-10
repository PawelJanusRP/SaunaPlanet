'use server'

import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createTrustedServerClient } from '@/lib/supabase/service'
import {
  validateCorrectionInput,
  type CorrectionFormInput,
  type FeedbackErrorCode,
  type FeedbackValidationCode,
} from '@/lib/feedback/intake'

/**
 * SP-042B — feedback intake action (docs/SP042_FEEDBACK_ARCHITECTURE.md §12.3,
 * §16).
 *
 * Boundary rules: the ONLY write path is the submit_feedback_report SECURITY
 * DEFINER RPC — this action never touches the feedback tables directly.
 * Identity comes exclusively from the session (the RPC binds
 * created_by := auth.uid()); no user identifier is accepted from the client.
 * The honeypot is resolved here: a filled trap field returns a fake success
 * WITHOUT calling the RPC (silent drop — bots get no signal). Anonymous rate
 * limiting derives a transient key by HMAC from the platform-set client
 * network address; the raw address is never persisted, never sent to the
 * database and never logged by this code.
 *
 * Trust model (security review fix, 2026-09-10): direct `anon` EXECUTE on
 * the RPC is REVOKED — a browser cannot call the intake RPC anonymously via
 * PostgREST at all, so a fresh random key hash per request can no longer
 * rotate around the anonymous rolling windows or skip this honeypot.
 *   - authenticated submissions: session client → RPC (auth.uid() binds,
 *     10/h per account);
 *   - anonymous submissions: ONLY this action, via the trusted server-only
 *     client (lib/supabase/service.ts) → RPC anonymous branch, which the
 *     database additionally pins to the trusted server context.
 * The trusted client is used EXCLUSIVELY for this one RPC call — never for
 * table access — and its credential never reaches the browser.
 */

export type SubmitFeedbackResult =
  | { ok: true }
  | { ok: false; code: FeedbackErrorCode | FeedbackValidationCode; message: string }

export type SubmitFeedbackInput = CorrectionFormInput & {
  /** Honeypot — humans never see or fill this field. */
  trap?: string
}

const RPC_CODES: ReadonlySet<string> = new Set([
  'invalid-input',
  'invalid-category',
  'invalid-email',
  'invalid-facility',
  'rate-limited',
])

/**
 * Derive the anonymous rolling-window key (architecture §16). Vercel
 * overwrites x-forwarded-for / x-real-ip at its edge, so on the deployment
 * platform these values are server-observed, not client-supplied. A missing
 * header degrades to one shared bucket — stricter than no limit, never an
 * invented identity. Requires the server-only FEEDBACK_RATE_LIMIT_SECRET;
 * without it anonymous intake fails closed ('unavailable').
 */
async function deriveAnonymousKeyHash(): Promise<string | null> {
  const secret = process.env.FEEDBACK_RATE_LIMIT_SECRET
  if (!secret || secret.length < 16) return null
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const address =
    h.get('x-real-ip')?.trim() ||
    (forwarded ? forwarded.split(',')[0]!.trim() : '') ||
    'no-client-address'
  return createHmac('sha256', secret).update(address).digest('hex')
}

export async function submitFeedbackReport(
  input: SubmitFeedbackInput
): Promise<SubmitFeedbackResult> {
  const t = await getTranslations('feedback')

  try {
    // Honeypot: pretend success, submit nothing.
    if (typeof input.trap === 'string' && input.trap.trim() !== '') {
      return { ok: true }
    }

    const validated = validateCorrectionInput(input)
    if (!validated.ok) {
      return {
        ok: false,
        code: validated.code,
        message: t(`form.validation.${validated.code}`),
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let keyHash: string | null = null
    let rpcClient = supabase
    if (!user) {
      keyHash = await deriveAnonymousKeyHash()
      if (!keyHash) {
        // fail closed: anonymous intake without a rate-limit key is not accepted
        console.error('submitFeedbackReport: FEEDBACK_RATE_LIMIT_SECRET missing/short')
        return { ok: false, code: 'unavailable', message: t('form.errors.unavailable') }
      }
      // Anonymous intake goes through the trusted server-only client (the RPC
      // grants exclude anon). Missing server credential → fail closed.
      const trusted = createTrustedServerClient()
      if (!trusted) {
        console.error('submitFeedbackReport: trusted server client unavailable')
        return { ok: false, code: 'unavailable', message: t('form.errors.unavailable') }
      }
      rpcClient = trusted
    }

    const locale = await getLocale()
    const { value } = validated

    const { data, error } = await rpcClient.rpc('submit_feedback_report', {
      p_type: 'facility_correction',
      p_sauna_id: value.saunaId,
      p_category: value.category,
      p_message: value.message,
      p_proposed_value: value.proposedValue,
      p_contact_email: value.contactEmail,
      p_locale: locale,
      p_source_path: `/${locale}/sauna/${value.saunaId}`,
      p_submitter_key_hash: keyHash,
    })

    if (error) {
      console.error('submit_feedback_report failed:', error.message)
      return { ok: false, code: 'unavailable', message: t('form.errors.unavailable') }
    }

    const result = data as { ok?: boolean; code?: string } | null
    if (result?.ok === true) {
      return { ok: true }
    }

    const code = (result?.code && RPC_CODES.has(result.code)
      ? result.code
      : 'unavailable') as FeedbackErrorCode
    return { ok: false, code, message: t(`form.errors.${code}`) }
  } catch (e) {
    console.error('submitFeedbackReport failed:', e)
    return { ok: false, code: 'unavailable', message: t('form.errors.unavailable') }
  }
}
