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
import { fetchFacilityImage } from '@/lib/import/imageFetch'
import {
  importSubmissionImageCore,
  type ImageImportResult,
} from '@/lib/import/imageImportCore'

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
        const { data, error } = await supabase
          .from('import_log')
          .insert({
            ...record,
            requested_by: user?.id,
          })
          .select('id')
          .single()
        // Audit-trail failure must not hide an already-computed result from
        // the user; it is logged server-side for investigation. The result
        // is then simply unlinkable (importId null).
        if (error) {
          console.error('import_log insert failed:', error.message)
          return null
        }
        return data.id as string
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

/**
 * SP-038 Slice 3 — best-effort link between an import operation and the
 * pending submission it produced, via the link_import_to_submission RPC
 * (the ONLY write path to import_log.sauna_id; SECURITY DEFINER with
 * strict predicates: caller owns both the log row and the pending sauna,
 * the log is unlinked and ok/partial). The RPC returns false for every
 * no-op — this action NEVER throws into the submission flow: a failed
 * link must not disturb an already-successful submission.
 */
export async function linkImportToSubmission(
  importId: string,
  saunaId: string
): Promise<{ linked: boolean }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('link_import_to_submission', {
      p_import_id: importId,
      p_sauna_id: saunaId,
    })
    if (error) {
      console.error('link_import_to_submission failed:', error.message)
      return { linked: false }
    }
    if (data !== true) {
      // diagnostic only — the RPC deliberately does not disclose the cause
      console.warn('link_import_to_submission no-op', { importId, saunaId })
    }
    return { linked: data === true }
  } catch (e) {
    console.error('linkImportToSubmission failed:', e)
    return { linked: false }
  }
}

/**
 * SP-038 Slice 3C — controlled, consent-gated facility-image import.
 *
 * The client supplies ONLY identifiers; the remote URL is read from the
 * caller-owned import_log row and the log must already be linked to this
 * pending sauna (link_import_to_submission is the trust anchor). Fetching
 * uses the dedicated SSRF-safe image profile (https, pinned lookup,
 * validated redirects, 5 MB, JPEG/PNG/WebP with signature verification);
 * upload goes to imported/{sauna_id}/ WITHOUT overwrite; attachment goes
 * through the attach_imported_photo RPC; the cover is set only when
 * currently empty. Best-effort by contract — any failure returns a
 * structured, user-safe status and never affects the submission itself.
 */
export async function importSubmissionImage(
  importId: string,
  saunaId: string
): Promise<ImageImportResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return await importSubmissionImageCore(importId, saunaId, {
      getUserId: async () => user?.id ?? null,

      getImportRecord: async (id) => {
        const { data, error } = await supabase
          .from('import_log')
          .select('sauna_id, extracted')
          .eq('id', id)
          .maybeSingle()
        if (error || !data) return null
        const draft = (data.extracted as { draft?: { imageUrl?: { value?: unknown } } } | null)?.draft
        const imageUrl = draft?.imageUrl?.value
        return {
          saunaId: (data.sauna_id as string | null) ?? null,
          imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
        }
      },

      fetchImage: (url) => fetchFacilityImage(url),

      uploadImage: async (path, bytes, contentType) => {
        const { error } = await supabase.storage
          .from('sauna-images')
          .upload(path, Buffer.from(bytes), { contentType, upsert: false })
        if (error) {
          console.error('imported image upload failed:', error.message)
          return null
        }
        return supabase.storage.from('sauna-images').getPublicUrl(path).data.publicUrl
      },

      attachPhoto: async (targetSaunaId, publicUrl, sourceUrl) => {
        const { data, error } = await supabase.rpc('attach_imported_photo', {
          target_sauna_id: targetSaunaId,
          p_image_url: publicUrl,
          p_source_url: sourceUrl,
        })
        if (error) {
          console.error('attach_imported_photo failed:', error.message)
          return null
        }
        return (data as string | null) ?? null
      },

      setCoverIfEmpty: async (targetSaunaId, publicUrl) => {
        const { data, error } = await supabase
          .from('saunas')
          .update({ cover_image_url: publicUrl })
          .eq('id', targetSaunaId)
          .is('cover_image_url', null)
          .eq('status', 'pending')
          .select('id')
        if (error) {
          console.error('cover update failed:', error.message)
          return false
        }
        return (data?.length ?? 0) > 0
      },
    })
  } catch (e) {
    console.error('importSubmissionImage failed:', e)
    return {
      ok: false,
      reason: 'fetch-failed',
      message: 'Nie udało się pobrać zdjęcia ze strony źródłowej',
    }
  }
}
