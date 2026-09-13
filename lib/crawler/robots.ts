import { fetchPage } from '@/lib/scanner/checks'

/**
 * Phase 25A — a real, path-matching robots.txt evaluator for crawl-time
 * discovery gating. This is deliberately separate from
 * lib/scanner/check-robots.ts, which parses robots.txt only far enough to
 * produce two scanner ISSUES (sitewide-disallow, unreachable) and never
 * answers "is this specific path allowed" — a question the crawler must
 * answer before fetching every single discovered URL, not just the
 * homepage. Reuses fetchPage (the same hardened SSRF/redirect/timeout
 * primitive) rather than any new fetch logic.
 *
 * Matching follows the widely-implemented (Google-documented) extension to
 * the original RFC-adjacent robots.txt convention: the LONGEST matching
 * rule wins regardless of Allow/Disallow order; on an exact-length tie,
 * Allow wins. `*` (wildcard) and a trailing `$` (end-of-path anchor) are
 * supported in rule paths, since real-world robots.txt files commonly use
 * both. This is not a full RFC 9309 implementation (e.g. it does not
 * special-case percent-encoding normalization beyond what URL parsing
 * already does) — it is deliberately scoped to what a crawl-discovery
 * gate actually needs: a defensible, documented, testable "allowed or
 * not," not a spec-exhaustive validator.
 */

export type RobotsRule = { allow: boolean; pattern: string }
export type RobotsGroup = { userAgents: string[]; rules: RobotsRule[] }
export type RobotsRules = { groups: RobotsGroup[]; sitemapUrls: string[] }

const WEBIOOM_USER_AGENT_TOKEN = 'websitecarebot'

function ruleToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern

  // Escape regex metacharacters EXCEPT '*', which robots.txt uses as its
  // own wildcard (matches any sequence, including none).
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')

  return new RegExp(`^${escaped}${anchored ? '$' : ''}`)
}

/**
 * Parses robots.txt content into user-agent groups + declared Sitemap
 * directives. A blank line starts a new group only once at least one
 * User-agent line has been seen for the current group AND at least one
 * rule/other directive has followed it (the standard "consecutive
 * User-agent lines share one group" convention) — simplified here to: a
 * new `User-agent:` line immediately following a group that already has
 * rules starts a NEW group; consecutive `User-agent:` lines with no rules
 * between them extend the CURRENT group's user-agent list. This matches
 * real-world robots.txt files correctly without needing full blank-line
 * state tracking.
 */
export function parseRobotsRules(content: string): RobotsRules {
  const groups: RobotsGroup[] = []
  const sitemapUrls: string[] = []
  let current: RobotsGroup | null = null
  let currentHasRules = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const directive = line.slice(0, colonIndex).trim().toLowerCase()
    const value = line.slice(colonIndex + 1).trim()

    if (directive === 'sitemap') {
      if (value) sitemapUrls.push(value)
      continue
    }

    if (directive === 'user-agent') {
      if (current && !currentHasRules) {
        current.userAgents.push(value.toLowerCase())
      } else {
        current = { userAgents: [value.toLowerCase()], rules: [] }
        groups.push(current)
        currentHasRules = false
      }
      continue
    }

    if (directive === 'disallow' || directive === 'allow') {
      if (!current) continue
      currentHasRules = true
      // An empty Disallow value is a documented no-op ("allow everything")
      // per the original convention — never treated as "disallow nothing"
      // vs. "disallow the empty string path", which would match nothing
      // anyway; skipping it entirely is equivalent and simpler.
      if (directive === 'disallow' && value === '') continue
      current.rules.push({ allow: directive === 'allow', pattern: value })
    }
  }

  return { groups, sitemapUrls }
}

function selectGroup(rules: RobotsRules): RobotsGroup | null {
  const specific = rules.groups.find((group) => group.userAgents.some((ua) => ua.includes(WEBIOOM_USER_AGENT_TOKEN)))
  if (specific) return specific

  return rules.groups.find((group) => group.userAgents.includes('*')) ?? null
}

/**
 * True if `path` (a pathname, optionally with a query string — e.g.
 * "/products/widget" or "/search?q=x") is allowed for webioom's crawler
 * under the given parsed rules. No matching group and no matching rule
 * both mean "allowed" — robots.txt is opt-out, not opt-in.
 */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const group = selectGroup(rules)
  if (!group || group.rules.length === 0) return true

  let winner: { allow: boolean; length: number } | null = null

  for (const rule of group.rules) {
    if (!ruleToRegExp(rule.pattern).test(path)) continue

    const length = rule.pattern.length
    if (!winner || length > winner.length || (length === winner.length && rule.allow && !winner.allow)) {
      winner = { allow: rule.allow, length }
    }
  }

  return winner ? winner.allow : true
}

export type FetchRobotsResult = { ok: true; rules: RobotsRules } | { ok: false; reason: 'unreachable' | 'not_found' }

/**
 * Fetches and parses `${origin}/robots.txt`. A 404/410 (or any successful
 * fetch that just isn't a 2xx) is reported as `not_found` — per the
 * standard convention, absence of robots.txt means "everything is
 * allowed," which callers should treat as an empty-but-valid rule set
 * (isPathAllowed already returns true for a group-less rule set) rather
 * than an error. A genuine network/SSRF-blocked failure is `unreachable`,
 * left for the caller to decide how to proceed (this phase's engine fails
 * OPEN on unreachable robots.txt — matching every major real crawler's own
 * documented behavior of proceeding when robots.txt cannot be fetched at
 * all, rather than refusing to crawl a site solely because /robots.txt
 * itself is down).
 */
export async function fetchRobotsRules(origin: string): Promise<FetchRobotsResult> {
  const result = await fetchPage(`${origin}/robots.txt`)

  if (!result.ok) return { ok: false, reason: 'unreachable' }
  if (result.finalStatus === 404 || result.finalStatus === 410) return { ok: false, reason: 'not_found' }
  if (result.finalStatus < 200 || result.finalStatus >= 300) return { ok: false, reason: 'unreachable' }

  return { ok: true, rules: parseRobotsRules(result.html) }
}
