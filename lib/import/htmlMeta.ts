// SP-038 — metadata extraction from untrusted HTML.
//
// Uses htmlparser2 in SAX mode: no DOM is built, no scripts execute, no
// markup is ever rendered. Only whitelisted metadata is collected, with
// hard bounds on JSON-LD script count and size.

import { Parser } from 'htmlparser2'

const MAX_JSONLD_SCRIPTS = 10
const MAX_JSONLD_LENGTH = 200_000
const MAX_TEXT_FIELD = 5_000
const MAX_LINKS = 20

export type HtmlDocumentMeta = {
  title: string | null
  canonical: string | null
  /** meta tags keyed by lowercased property/name; first occurrence wins. */
  meta: Map<string, string>
  /** Raw contents of <script type="application/ld+json"> blocks (bounded). */
  jsonLdBlocks: string[]
  mailtoLinks: string[]
  telLinks: string[]
  socialLinks: string[]
}

const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'fb.com', 'instagr.am']

function isSocialLink(href: string): boolean {
  try {
    const url = new URL(href)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const host = url.hostname.toLowerCase()
    return SOCIAL_HOSTS.some((d) => host === d || host === `www.${d}` || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

function pushUnique(list: string[], value: string) {
  if (list.length < MAX_LINKS && !list.includes(value)) list.push(value)
}

export function parseHtmlDocument(html: string): HtmlDocumentMeta {
  const meta = new Map<string, string>()
  const jsonLdBlocks: string[] = []
  const mailtoLinks: string[] = []
  const telLinks: string[] = []
  const socialLinks: string[] = []
  let title: string | null = null
  let canonical: string | null = null

  let inTitle = false
  let titleBuffer = ''
  let inJsonLd = false
  let jsonLdBuffer = ''

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase()
        if (tag === 'title' && title === null) {
          inTitle = true
          titleBuffer = ''
        } else if (tag === 'meta') {
          const key = (attribs.property ?? attribs.name ?? '').trim().toLowerCase()
          const content = (attribs.content ?? '').trim()
          if (key && content && !meta.has(key)) {
            meta.set(key, content.slice(0, MAX_TEXT_FIELD))
          }
        } else if (tag === 'link') {
          const rel = (attribs.rel ?? '').trim().toLowerCase()
          if (rel === 'canonical' && attribs.href && canonical === null) {
            canonical = attribs.href.trim()
          }
        } else if (tag === 'script') {
          const type = (attribs.type ?? '').trim().toLowerCase()
          if (type === 'application/ld+json' && jsonLdBlocks.length < MAX_JSONLD_SCRIPTS) {
            inJsonLd = true
            jsonLdBuffer = ''
          }
        } else if (tag === 'a' && attribs.href) {
          const href = attribs.href.trim()
          const lower = href.toLowerCase()
          if (lower.startsWith('mailto:')) {
            const address = href.slice('mailto:'.length).split('?')[0].trim()
            if (address) pushUnique(mailtoLinks, address)
          } else if (lower.startsWith('tel:')) {
            const number = href.slice('tel:'.length).trim()
            if (number) pushUnique(telLinks, number)
          } else if (isSocialLink(href)) {
            pushUnique(socialLinks, href)
          }
        }
      },
      ontext(text) {
        if (inTitle && titleBuffer.length < MAX_TEXT_FIELD) titleBuffer += text
        if (inJsonLd && jsonLdBuffer.length < MAX_JSONLD_LENGTH) jsonLdBuffer += text
      },
      onclosetag(name) {
        const tag = name.toLowerCase()
        if (tag === 'title' && inTitle) {
          inTitle = false
          const cleaned = titleBuffer.replace(/\s+/g, ' ').trim()
          if (cleaned) title = cleaned.slice(0, MAX_TEXT_FIELD)
        } else if (tag === 'script' && inJsonLd) {
          inJsonLd = false
          const trimmed = jsonLdBuffer.trim()
          if (trimmed) jsonLdBlocks.push(trimmed)
        }
      },
    },
    { decodeEntities: true }
  )
  parser.write(html)
  parser.end()

  return { title, canonical, meta, jsonLdBlocks, mailtoLinks, telLinks, socialLinks }
}
