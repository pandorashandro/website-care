import { classifyTitleLength, TITLE_MIN_LENGTH, TITLE_MAX_LENGTH } from '@/lib/scanner/title-rules'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 28 — title presence/length. Reuses lib/scanner/title-rules.ts's
 * `classifyTitleLength` VERBATIM rather than reimplementing the
 * missing/too_short/too_long boundary logic — that module is already the
 * single source of truth shared by the legacy scanner and the title
 * Prepare-Fix verifier (see its own doc comment), so a page this check
 * would flag is exactly a page the existing fix-verification pipeline would
 * still consider unresolved, and vice versa. The 30/60-character thresholds
 * are NOT reinvented or re-justified here — they are inherited from that
 * existing, already-centralized, already-tested source of truth rather than
 * a fresh "folklore" pick for this phase.
 *
 * Length findings (too_short/too_long) are deliberately LOWER severity than
 * absence (missing) — a length outside the recommended window is a search-
 * engine-display heuristic (how much of the title a SERP snippet shows),
 * not a hard error; a page with no title at all has no page-specific search
 * signal whatsoever, a categorically worse condition.
 *
 * PAGE-LOCAL, not suppressed on a partial crawl: a page's own title is
 * fully known once that page itself was fetched, regardless of how much of
 * the rest of the site was reached.
 */
export function analyzeTitleLength(context: AnalyzerContext): RawFinding[] {
  const missing: RawFindingPageEvidence[] = []
  const tooShort: RawFindingPageEvidence[] = []
  const tooLong: RawFindingPageEvidence[] = []

  for (const page of context.eligiblePages) {
    const status = classifyTitleLength(page.title)
    if (status === 'ok') continue

    const instance: RawFindingPageEvidence = {
      url: page.url,
      currentState: { label: 'Title', value: page.title },
      detail: { titleLength: page.title?.length ?? 0 },
    }

    if (status === 'missing') missing.push(instance)
    else if (status === 'too_short') tooShort.push(instance)
    else if (status === 'too_long') tooLong.push(instance)
  }

  const findings: RawFinding[] = []

  if (missing.length > 0) {
    findings.push({
      checkKey: 'missing_title',
      category: 'title',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Pages have no title tag',
      explanation: `${missing.length} page${missing.length === 1 ? '' : 's'} webioom analyzed ${missing.length === 1 ? 'has' : 'have'} no <title> tag.`,
      whyItMatters: 'Without a title, search engines may generate their own snippet from other page content, and the page loses control over how it is presented in search results and browser tabs.',
      recommendation: 'Add a descriptive, page-specific <title> tag summarizing what this page is about.',
      evidence: {},
      affectedPages: missing.map((instance) => ({ ...instance, desiredState: { label: 'Title', value: `A descriptive title, ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters` }, remediationType: 'content_field_replacement' })),
    })
  }

  if (tooShort.length > 0) {
    findings.push({
      checkKey: 'title_too_short',
      category: 'title',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Page titles are too short',
      explanation: `${tooShort.length} page${tooShort.length === 1 ? '' : 's'} webioom analyzed ${tooShort.length === 1 ? 'has' : 'have'} a title under ${TITLE_MIN_LENGTH} characters.`,
      whyItMatters: 'A very short title often under-uses the space search engines display, providing less page-specific context than it could.',
      recommendation: `Expand the title to roughly ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters so it more fully describes the page.`,
      evidence: {},
      affectedPages: tooShort.map((instance) => ({ ...instance, remediationType: 'content_field_replacement' })),
    })
  }

  if (tooLong.length > 0) {
    findings.push({
      checkKey: 'title_too_long',
      category: 'title',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Page titles are too long',
      explanation: `${tooLong.length} page${tooLong.length === 1 ? '' : 's'} webioom analyzed ${tooLong.length === 1 ? 'has' : 'have'} a title over ${TITLE_MAX_LENGTH} characters.`,
      whyItMatters: "A very long title risks being cut off in search results, hiding whatever text comes after the truncation point.",
      recommendation: `Shorten the title to under ${TITLE_MAX_LENGTH} characters so it isn't cut off in search results.`,
      evidence: {},
      affectedPages: tooLong.map((instance) => ({ ...instance, remediationType: 'content_field_replacement' })),
    })
  }

  return findings
}

/**
 * Small, closed, documented list of known generic/placeholder title values
 * — deliberately NOT a fuzzy content-quality judgment (that would be a
 * Content Intelligence concern, out of scope here — see this task's own
 * "do not invent keyword intent" instruction). Fires only on an EXACT match
 * (case/whitespace-insensitive) against a value that provides essentially
 * zero page-specific information, most commonly left over from a CMS
 * default/template. A page legitimately titled exactly one of these is rare
 * enough, and the check severity/confidence low/medium enough, that the
 * false-positive cost of flagging it is small relative to the value of
 * catching genuine leftover placeholders.
 */
const GENERIC_TITLE_VALUES = new Set([
  'home',
  'homepage',
  'welcome',
  'welcome to wordpress',
  'untitled',
  'untitled page',
  'untitled document',
  'new page',
  'index',
  'document',
  'default title',
  'page title',
  'my site',
  'my blog',
  'sample page',
])

function normalizeForComparison(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Phase 28 — weak/generic title. A NARROWER, separate check from
 * missing/too-short/too-long (which are purely length-based): this one
 * fires only when a title EXISTS but matches a known placeholder value
 * exactly. Deliberately its own check key (not folded into missing_title)
 * so its lower confidence and different actionability are visible
 * independently.
 */
export function analyzeWeakTitle(context: AnalyzerContext): RawFinding[] {
  const weak = context.eligiblePages.filter((page) => page.title && GENERIC_TITLE_VALUES.has(normalizeForComparison(page.title)))

  if (weak.length === 0) return []

  return [
    {
      checkKey: 'weak_title',
      category: 'title',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'medium',
      title: 'Pages use a generic, placeholder-style title',
      explanation: `${weak.length} page${weak.length === 1 ? '' : 's'} webioom analyzed ${weak.length === 1 ? 'has' : 'have'} a title matching a common generic/placeholder value (e.g. "Home", "Untitled").`,
      whyItMatters: 'A generic title provides little page-specific information to search engines or visitors scanning search results — it is often a leftover CMS default rather than an intentional choice.',
      recommendation: 'Replace the generic title with one that describes what this specific page is about.',
      evidence: {},
      affectedPages: weak.map((page) => ({
        url: page.url,
        currentState: { label: 'Title', value: page.title },
        remediationType: 'content_field_replacement',
        detail: {},
      })),
    },
  ]
}
