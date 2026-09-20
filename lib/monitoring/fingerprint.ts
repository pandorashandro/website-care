import { normalizeUrl } from '@/lib/scanner/url-utils'

/**
 * Sprint 2, Prompt 1 — MONITORING FOUNDATION.
 *
 * A deterministic, evidence-based identity for "the same logical problem"
 * across two independent scans, so change detection never has to compare
 * database row UUIDs (every finding row is freshly re-inserted by every
 * analysis run — see each engine's `saveAnalysis`/`store.ts`, which always
 * replaces the prior (crawl_run_id, analyzer_version) result wholesale).
 *
 * DELIBERATELY NOT one universal shape — three scope semantics, expressed
 * through the SAME two already-persisted per-instance fields every finding
 * table already has (`url`, `affected_resource_url`), never a new field:
 *
 *   SITE-SCOPED   (finding.scope === 'site'): identity is the check itself
 *                 — `${pillar}:${checkKey}` — a single site-wide fact,
 *                 independent of any specific instance (e.g. "robots.txt
 *                 blocks most of the site").
 *   PAGE-SCOPED   (finding.scope === 'page', no affectedResourceUrl):
 *                 `${pillar}:${checkKey}:${normalizedUrl}` — e.g. "missing
 *                 title on /services".
 *   RESOURCE/EDGE-SCOPED (finding.scope === 'page', WITH an
 *                 affectedResourceUrl on the instance): `${pillar}:
 *                 ${checkKey}:${normalizedUrl}:${resourceDiscriminator}` —
 *                 covers both "a specific resource on a page" (missing alt
 *                 on one image) and "an edge between two pages" (a broken
 *                 internal link FROM this page TO that URL), since both
 *                 already use the identical (url, affectedResourceUrl)
 *                 pair by construction (see e.g.
 *                 lib/architecture/checks/broken-edges.ts, which populates
 *                 `url` with the SOURCE page and `affectedResourceUrl` with
 *                 the broken TARGET).
 *
 * `affectedResourceUrl` is treated as an OPAQUE discriminator, never
 * URL-normalized — some checks populate it with a genuine URL (an image
 * src, a link target), but Content's exact-duplicate check populates it
 * with a content hash instead (see lib/content/checks/exact-duplicate.ts).
 * Normalizing it as if it were always a URL would silently corrupt a
 * non-URL discriminator like that hash. It is only trimmed and
 * lowercased for stability against incidental casing differences.
 *
 * No AI involvement anywhere in this module, per this sprint's explicit
 * requirement — identity is pure string composition over already-trusted,
 * already-persisted evidence.
 */

export type FindingScope = 'page' | 'site'

export type FindingInstanceIdentity = {
  url: string
  affectedResourceUrl: string | null
}

export type FindingIdentityInput = {
  /** The canonical pillar key (e.g. 'technical_seo', 'accessibility') — included so an identical checkKey string can never collide across two different engines, even though no such collision exists today. */
  pillar: string
  checkKey: string
  scope: FindingScope
  /** Required for scope === 'page'; ignored for scope === 'site' (a site-scoped fact has no per-instance identity to key off). */
  instance?: FindingInstanceIdentity
}

function normalizeDiscriminator(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * A page-scoped identity needs SOME real URL to resolve against for
 * normalization; the instance's own `url` is always that URL (it is,
 * itself, the page the finding was observed on).
 */
function normalizedPageUrl(url: string): string {
  return normalizeUrl(url, url) ?? normalizeDiscriminator(url)
}

/**
 * The one, centralized identity function every comparison in this module
 * goes through — see this file's own doc comment for the full scope-by-
 * scope reasoning. Deterministic: the same logical finding always produces
 * the exact same string, and two genuinely different findings can never
 * collide (barring an intentional hash-style discriminator collision,
 * which is each check's own responsibility, not this function's).
 */
export function computeFindingFingerprint(input: FindingIdentityInput): string {
  if (input.scope === 'site') {
    return `${input.pillar}:${input.checkKey}`
  }

  if (!input.instance) {
    throw new Error(`computeFindingFingerprint: a page-scoped finding (checkKey="${input.checkKey}") requires an instance.`)
  }

  const pageUrl = normalizedPageUrl(input.instance.url)

  if (!input.instance.affectedResourceUrl) {
    return `${input.pillar}:${input.checkKey}:${pageUrl}`
  }

  return `${input.pillar}:${input.checkKey}:${pageUrl}:${normalizeDiscriminator(input.instance.affectedResourceUrl)}`
}
