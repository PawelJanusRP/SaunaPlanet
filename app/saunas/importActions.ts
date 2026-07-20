'use server'

import { createClient } from '@/lib/supabase/server'
import {
  extractDraftCore,
  IMPORT_RATE_WINDOW_MS,
  type DuplicateCandidate,
  type ExtractDraftResult,
  type ImportLogRecord,
} from '@/lib/import/actionCore'
import { extractFacilityFromUrl } from '@/lib/import'

/**
 * SP-038 Slice 2 — trusted extraction action for the /submit import
 * preview (docs/SP038_SMART_IMPORT_ARCHITECTURE.md §Slice 2).
 *
 * Boundary rules: authenticated users only; the provider is chosen by
 * server-side classification (never by the client); raw HTML never leaves
 * the server; every accepted operation writes exactly one append-only
 * import_log row under the caller's own RLS identity; the 10/hour rolling
 * limit is enforced server-side against import_log. The action never
 * creates or updates saunas, never uploads images and never uses a
 * service-role client.
 */
export async function extractFacilityDraft(rawUrl: string): Promise<ExtractDraftResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return await extractDraftCore(rawUrl, {
      getUserId: async () => user?.id ?? null,

      countRecentImports: async () => {
        const since = new Date(Date.now() - IMPORT_RATE_WINDOW_MS).toISOString()
        const { count, error } = await supabase
          .from('import_log')
          .select('id', { count: 'exact', head: true })
          .eq('requested_by', user?.id ?? '')
          .gte('created_at', since)
        if (error) {
          // Fail CLOSED: if the limit cannot be verified, treat it as
          // exhausted rather than allowing unmetered fetches.
          console.error('import_log rate-limit count failed:', error.message)
          return Number.MAX_SAFE_INTEGER
        }
        return count ?? 0
      },

      insertImportLog: async (record: ImportLogRecord) => {
        const { error } = await supabase.from('import_log').insert({
          ...record,
          requested_by: user?.id,
        })
        // Audit-trail failure must not hide an already-computed result from
        // the user; it is logged server-side for investigation.
        if (error) console.error('import_log insert failed:', error.message)
      },

      extract: (normalizedUrl: string) => extractFacilityFromUrl(normalizedUrl),

      findDuplicates: async (params): Promise<DuplicateCandidate[]> => {
        const { data, error } = await supabase.rpc('find_similar_saunas', {
          p_name: params.name,
          p_lat: params.lat,
          p_lng: params.lng,
          p_website: params.website,
          p_phone: params.phone,
          p_facebook_url: params.sourceUrl, // matches the saunas.source_url arm
        })
        if (error) {
          // Warn-only contract: a broken dedup lookup never fails the import.
          console.error('find_similar_saunas (import) failed:', error.message)
          return []
        }
        return (data ?? []) as DuplicateCandidate[]
      },
    })
  } catch (e) {
    console.error('extractFacilityDraft failed:', e)
    return {
      ok: false,
      code: 'fetch-failed',
      message: 'Nie udało się pobrać danych — spróbuj ponownie',
    }
  }
}
