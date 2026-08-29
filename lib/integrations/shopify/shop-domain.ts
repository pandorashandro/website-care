import 'server-only'

const MYSHOPIFY_SUFFIX = '.myshopify.com'
const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Strictly validates and normalizes a Shopify shop identifier down to its
 * canonical `{label}.myshopify.com` hostname — the only identity OAuth and
 * the Admin API ever trust (see oauth.ts, client.ts). This is deliberately
 * NOT a loose `endsWith("myshopify.com")` check: that alone would accept
 * "evilmyshopify.com" (no label boundary) or, if ever applied to a full
 * URL, "myshopify.com.attacker.net". Every rejection path below exists
 * because a real bypass shape was considered for it.
 *
 * Accepts:
 *   - a bare label, e.g. "my-store"
 *   - a bare canonical hostname, e.g. "my-store.myshopify.com"
 *   - a full https URL with no path/query/fragment/userinfo/port,
 *     e.g. "https://my-store.myshopify.com"
 *
 * Rejects everything else, including: http:// (non-https), userinfo
 * (user:pass@), explicit ports, any path/query/fragment, whitespace,
 * non-ASCII/IDN labels, and any hostname that merely contains
 * "myshopify.com" without an exact, dot-bounded suffix match.
 */
export function normalizeShopifyShopDomain(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let candidate: string

  if (/^https?:\/\//i.test(trimmed)) {
    // Reject non-https schemes outright rather than silently upgrading them
    // — an http:// input here reflects a malformed/untrusted caller, not a
    // normalization opportunity.
    if (!/^https:\/\//i.test(trimmed)) return null

    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }

    if (parsed.username || parsed.password) return null
    if (parsed.port) return null
    if (parsed.pathname !== '' && parsed.pathname !== '/') return null
    if (parsed.search || parsed.hash) return null

    candidate = parsed.hostname
  } else {
    candidate = trimmed
  }

  candidate = candidate.toLowerCase()

  // No scheme was present (or one was and hostname was already extracted
  // above) — a bare-string candidate must not carry any of these either,
  // since a scheme-less string like "my-store.myshopify.com/admin" or
  // "user:pass@my-store.myshopify.com" must not slip through as a "label".
  if (/[\s/?#@:]/.test(candidate)) return null

  const label = candidate.endsWith(MYSHOPIFY_SUFFIX) ? candidate.slice(0, -MYSHOPIFY_SUFFIX.length) : candidate

  if (!LABEL_PATTERN.test(label)) return null

  // Defense against IDN/punycode/Unicode confusables: a label that isn't
  // already plain ASCII cannot have passed LABEL_PATTERN above (which is
  // ASCII-only), but this is kept as an explicit, self-documenting guard
  // rather than relying solely on the regex's incidental behavior.
  if (/[^\x00-\x7F]/.test(label)) return null

  return `${label}${MYSHOPIFY_SUFFIX}`
}
