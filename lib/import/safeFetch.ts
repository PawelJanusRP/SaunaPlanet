// SP-038 — SSRF-safe server-side HTML fetcher.
//
// Server-only (Node runtime). The policy loop is transport-agnostic and
// deterministic: resolve → validate every address → connect PINNED to the
// validated addresses (DNS rebinding cannot swap the target between check
// and connect) → validate every redirect hop → stream with a hard size cap.
//
// This module must never be turned into a generic URL proxy: it returns
// parsed-side data to trusted server code only and raw HTML never reaches
// the browser.

import { lookup } from 'node:dns'
import { isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'
import { isPublicAddress, validateFetchTarget } from './ssrf'
import type { ImportErrorCode } from './types'

export const DEFAULT_TIMEOUT_MS = 8_000
export const DEFAULT_MAX_BYTES = 2_000_000 // decompressed HTML cap
export const DEFAULT_MAX_REDIRECTS = 3

const USER_AGENT = 'SaunaPlanetImport/1.0 (+https://sauna-planet.vercel.app)'
const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml']

export type TransportResponse = {
  status: number
  headers: { get(name: string): string | null }
  body: AsyncIterable<Uint8Array> | null
  /** Releases per-request resources (called exactly once by the policy loop). */
  close?: () => void | Promise<void>
}

export type SafeFetchTransport = {
  /** Resolves a hostname to its IP addresses (A + AAAA). */
  resolve(hostname: string): Promise<string[]>
  /** Performs ONE request without following redirects, connecting only to `addresses`. */
  request(
    url: string,
    opts: { signal: AbortSignal; addresses: string[]; accept?: string }
  ): Promise<TransportResponse>
}

export type SafeFetchOptions = {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  transport?: SafeFetchTransport
}

export type SafeFetchSuccess = {
  ok: true
  finalUrl: string
  status: number
  html: string
}

export type SafeFetchFailure = {
  ok: false
  code: ImportErrorCode
  status?: number
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure

function resolveAddresses(hostname: string): Promise<string[]> {
  return new Promise((resolvePromise, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) reject(err)
      else resolvePromise(addresses.map((a) => a.address))
    })
  })
}

type PinnedLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number
) => void

function undiciTransport(): SafeFetchTransport {
  return {
    resolve: resolveAddresses,
    async request(url, { signal, addresses, accept }) {
      const pinnedLookup = (
        _hostname: string,
        options: { all?: boolean },
        callback: PinnedLookupCallback
      ) => {
        const results = addresses.map((address) => ({ address, family: isIP(address) }))
        if (options?.all) callback(null, results)
        else callback(null, results[0].address, results[0].family)
      }
      const agent = new Agent({
        connect: { lookup: pinnedLookup as never },
      })
      const response = await undiciFetch(url, {
        signal,
        redirect: 'manual',
        dispatcher: agent,
        headers: {
          'user-agent': USER_AGENT,
          accept: accept ?? 'text/html,application/xhtml+xml',
          'accept-language': 'pl,en;q=0.8',
        },
      })
      return {
        status: response.status,
        headers: response.headers,
        body: response.body as AsyncIterable<Uint8Array> | null,
        close: () => agent.close().catch(() => undefined),
      }
    },
  }
}

/** "text/html; charset=utf-8" → "text/html" (lowercased). */
export function mimeOf(contentType: string | null): string | null {
  if (!contentType) return null
  return contentType.split(';')[0].trim().toLowerCase()
}

function charsetFrom(contentType: string | null): string {
  const match = contentType?.match(/charset\s*=\s*"?([\w-]+)"?/i)
  return match ? match[1] : 'utf-8'
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
}

async function readBody(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of body) {
    total += chunk.byteLength
    if (total > maxBytes) return { ok: false }
    chunks.push(chunk)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes: merged }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type SafeFetchBytesSuccess = {
  ok: true
  finalUrl: string
  status: number
  bytes: Uint8Array
  contentType: string | null
}

export type SafeFetchBytesResult = SafeFetchBytesSuccess | SafeFetchFailure

/**
 * The generic SSRF-safe fetch policy loop (Slice 3C refactor — behavior
 * identical to the original HTML-only fetcher): https on port 443 only,
 * every hop re-validated, DNS results pinned to the socket, at most
 * `maxRedirects` redirects, a total deadline, a streamed size cap and a
 * caller-supplied content-type allowlist. Returns raw bytes; callers add
 * format-specific validation (HTML decode, image signatures).
 */
export async function safeFetchBytes(
  rawUrl: string,
  allowedContentTypes: string[],
  options: SafeFetchOptions & { accept?: string } = {}
): Promise<SafeFetchBytesResult> {
  if (typeof window !== 'undefined') {
    throw new Error('safeFetchBytes is server-only')
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const transport = options.transport ?? undiciTransport()
  const signal = AbortSignal.timeout(timeoutMs)

  let currentUrl = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = validateFetchTarget(currentUrl)
    if (!target.ok) {
      // A hop after the first one means a redirect pointed somewhere disallowed.
      return { ok: false, code: hop === 0 ? target.code : 'invalid-redirect' }
    }

    const hostname = target.url.hostname
    let addresses: string[]
    const literal = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
    if (isIP(literal) !== 0) {
      addresses = [literal] // already validated by validateFetchTarget
    } else {
      try {
        addresses = await transport.resolve(hostname)
      } catch {
        return { ok: false, code: 'dns-error' }
      }
      if (addresses.length === 0) return { ok: false, code: 'dns-error' }
      if (!addresses.every(isPublicAddress)) return { ok: false, code: 'blocked-address' }
    }

    let response: TransportResponse
    try {
      response = await transport.request(target.url.toString(), {
        signal,
        addresses,
        accept: options.accept,
      })
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return { ok: false, code: 'timeout' }
      }
      return { ok: false, code: 'network-error' }
    }

    try {
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        if (!location) return { ok: false, code: 'invalid-redirect' }
        if (hop === maxRedirects) return { ok: false, code: 'too-many-redirects' }
        let nextUrl: URL
        try {
          nextUrl = new URL(location, target.url)
        } catch {
          return { ok: false, code: 'invalid-redirect' }
        }
        currentUrl = nextUrl.toString()
        continue
      }

      if (response.status < 200 || response.status >= 300) {
        return { ok: false, code: 'http-status', status: response.status }
      }

      const contentType = response.headers.get('content-type')
      const mime = mimeOf(contentType)
      if (!mime || !allowedContentTypes.includes(mime)) {
        return { ok: false, code: 'unsupported-content-type' }
      }
      const contentLength = response.headers.get('content-length')
      if (contentLength && Number(contentLength) > maxBytes) {
        return { ok: false, code: 'response-too-large' }
      }
      if (!response.body) return { ok: false, code: 'network-error' }

      let read: Awaited<ReturnType<typeof readBody>>
      try {
        read = await readBody(response.body, maxBytes)
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          return { ok: false, code: 'timeout' }
        }
        return { ok: false, code: 'network-error' }
      }
      if (!read.ok) return { ok: false, code: 'response-too-large' }

      return {
        ok: true,
        finalUrl: target.url.toString(),
        status: response.status,
        bytes: read.bytes,
        contentType,
      }
    } finally {
      await response.close?.()
    }
  }
  return { ok: false, code: 'too-many-redirects' }
}

/**
 * Fetches a public HTML document with the full SSRF policy applied.
 * Accepts only https URLs on port 443, follows at most `maxRedirects`
 * validated redirects, enforces a total deadline and a decompressed size
 * cap, and accepts only HTML content types.
 */
export async function safeFetchHtml(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const fetched = await safeFetchBytes(rawUrl, ALLOWED_CONTENT_TYPES, options)
  if (!fetched.ok) return fetched
  return {
    ok: true,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    html: decode(fetched.bytes, charsetFrom(fetched.contentType)),
  }
}
