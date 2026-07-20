// SP-038 — SSRF address and target validation.
// Pure functions (no I/O) so every rule is unit-testable.

import { isIP } from 'node:net'
import type { ImportErrorCode } from './types'

/** Hostnames that must never be fetched regardless of DNS resolution. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'metadata',
  'metadata.azure.com',
  'metadata.packet.net',
])

function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number)
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
}

function inCidr4(ip: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return (ip & mask) === (ipv4ToInt(base) & mask)
}

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network" / unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

function isPublicIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return !BLOCKED_IPV4_RANGES.some(([base, prefix]) => inCidr4(n, base, prefix))
}

/** Expands an IPv6 address into 8 numeric hextets (assumes isIP() === 6). */
function parseIpv6(ip: string): number[] | null {
  let addr = ip
  // Embedded IPv4 tail, e.g. ::ffff:192.168.0.1
  const v4Match = addr.match(/(\d+\.\d+\.\d+\.\d+)$/)
  let v4Tail: number[] = []
  if (v4Match) {
    const n = ipv4ToInt(v4Match[1])
    v4Tail = [(n >>> 16) & 0xffff, n & 0xffff]
    addr = addr.slice(0, addr.length - v4Match[1].length).replace(/:$/, ':')
    if (addr.endsWith(':') && !addr.endsWith('::')) addr = addr.slice(0, -1)
  }
  const parts = addr.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':').filter(Boolean).map((h) => parseInt(h, 16)) : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':').filter(Boolean).map((h) => parseInt(h, 16)) : []
  const filled = [...head, ...Array(Math.max(0, 8 - head.length - tail.length - v4Tail.length)).fill(0), ...tail, ...v4Tail]
  if (filled.length !== 8 || filled.some((h) => Number.isNaN(h))) return null
  return filled
}

function isPublicIpv6(ip: string): boolean {
  const hextets = parseIpv6(ip)
  if (!hextets) return false // unparseable → treat as unsafe
  const [h0, h1] = hextets
  const all = hextets.every((h) => h === 0)
  if (all) return false // :: unspecified
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) return false // ::1 loopback
  // IPv4-mapped (::ffff:0:0/96) and IPv4-translated (::ffff:0:0:0/96, 64:ff9b::/96 NAT64)
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    const v4 = ((hextets[6] << 16) | hextets[7]) >>> 0
    return !BLOCKED_IPV4_RANGES.some(([base, prefix]) => inCidr4(v4, base, prefix))
  }
  if (h0 === 0x64 && h1 === 0xff9b) return false // NAT64 — reject rather than trust the mapping
  if ((h0 & 0xfe00) === 0xfc00) return false // fc00::/7 unique-local
  if ((h0 & 0xffc0) === 0xfe80) return false // fe80::/10 link-local
  if ((h0 & 0xff00) === 0xff00) return false // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return false // documentation
  if (h0 === 0x0100 && h1 === 0x0000) return false // 100::/64 discard
  return true
}

/** True when the resolved address is safe to connect to from the server. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPublicIpv4(ip)
  if (family === 6) return isPublicIpv6(ip.toLowerCase())
  return false
}

export type TargetValidation = { ok: true; url: URL } | { ok: false; code: ImportErrorCode }

/**
 * Validates a URL as a fetch target (also applied to every redirect hop):
 * https only, no credentials, port 443 only, hostname not on the blocklist,
 * IP-literal hostnames must be public.
 */
export function validateFetchTarget(rawUrl: string): TargetValidation {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, code: 'invalid-url' }
  }
  if (url.username !== '' || url.password !== '') return { ok: false, code: 'credentials-in-url' }
  if (url.protocol !== 'https:') return { ok: false, code: 'insecure-protocol' }
  if (url.port !== '' && url.port !== '443') return { ok: false, code: 'blocked-port' }

  const host = url.hostname.toLowerCase()
  const bare = host.replace(/\.$/, '')
  if (BLOCKED_HOSTNAMES.has(bare) || bare.endsWith('.localhost') || bare.endsWith('.internal')) {
    return { ok: false, code: 'blocked-host' }
  }

  // IP-literal hosts: validate directly (IPv6 literals come bracketed).
  const literal = bare.startsWith('[') && bare.endsWith(']') ? bare.slice(1, -1) : bare
  if (isIP(literal) !== 0 && !isPublicAddress(literal)) {
    return { ok: false, code: 'blocked-address' }
  }

  return { ok: true, url }
}
