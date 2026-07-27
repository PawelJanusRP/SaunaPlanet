// Test helpers: deterministic fake transport for safeFetch — no real
// network or DNS is ever touched in automated tests.

import type { SafeFetchTransport, TransportResponse } from '../safeFetch'

export type FakeRoute = {
  status?: number
  headers?: Record<string, string>
  body?: string | Uint8Array[]
  /** When set, the request never resolves until the signal aborts. */
  hang?: boolean
}

export type FakeNetwork = {
  /** hostname → resolved IP addresses; missing hostname = DNS error. */
  dns: Record<string, string[]>
  /** exact URL → response description. */
  routes: Record<string, FakeRoute>
}

const encoder = new TextEncoder()

function toChunks(body: string | Uint8Array[] | undefined): Uint8Array[] {
  if (body === undefined) return []
  if (typeof body === 'string') return [encoder.encode(body)]
  return body
}

async function* iterate(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) yield chunk
}

export function makeTransport(network: FakeNetwork, log?: string[]): SafeFetchTransport {
  return {
    async resolve(hostname) {
      const addresses = network.dns[hostname]
      if (!addresses) throw new Error(`ENOTFOUND ${hostname}`)
      return addresses
    },
    async request(url, { signal }): Promise<TransportResponse> {
      log?.push(url)
      const route = network.routes[url]
      if (!route) throw new Error(`no fake route for ${url}`)
      if (route.hang) {
        await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      }
      const headers = new Map(
        Object.entries({ 'content-type': 'text/html; charset=utf-8', ...(route.headers ?? {}) }).map(
          ([k, v]) => [k.toLowerCase(), v]
        )
      )
      return {
        status: route.status ?? 200,
        headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
        body: iterate(toChunks(route.body)),
      }
    },
  }
}
