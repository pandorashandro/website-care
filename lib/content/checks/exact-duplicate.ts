import type { AnalyzerContext, PageContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 29 — exact duplicate content.
 *
 * Groups eligible pages by `content_hash` (lib/crawler/content-extract.ts) —
 * a sha256 fingerprint of each page's FULL, untruncated, normalized
 * paragraph text, computed once at crawl time. This is deliberately NOT a
 * comparison of raw full HTML (which would trivially "match" any two pages
 * sharing the same template even with completely different substantive
 * content, since markup/attributes/scripts would dominate the comparison) —
 * comparing normalized PARAGRAPH TEXT ONLY means two pages only hash
 * identically when their actual substantive written content, not their
 * template, is byte-for-byte the same.
 *
 * Pages below MIN_WORDS_FOR_FINGERPRINT (10 words — see content-extract.ts)
 * have a null content_hash and are EXCLUDED from grouping entirely: two
 * near-empty pages are not meaningfully "duplicates of each other" in any
 * useful sense — both are already covered by substantively_thin_page, and
 * grouping them here would just be noise restating the same underlying
 * problem under a different finding.
 *
 * PERFORMANCE: grouping by a Map<hash, pages[]> is O(n) in the number of
 * eligible pages — safe at every crawl budget (30/150/500 pages), no
 * pairwise (O(n²)) comparison anywhere.
 *
 * DUPLICATE-RESISTANT BY CONSTRUCTION: exactly one evidence instance per
 * AFFECTED PAGE (never one per pair) — mirrors lib/on-page/checks/
 * duplicate-title.ts's own proven pattern exactly, including reusing
 * `affectedResourceUrl` as the shared group key so uniqueTargetCount
 * becomes the distinct duplicate-GROUP count for free via aggregate.ts's
 * existing three-way counting mechanism.
 *
 * NOT suppressed on a partial crawl — an observed exact match between two
 * ANALYZED pages is a true, standalone fact; it just cannot be read as "the
 * only duplicates on the entire site."
 *
 * HONEST V1 SCOPE (Phase 29 targeted completion pass — audited against a
 * real Bespoke crawl that surfaced ?wpr_templates=.../elementor-hf/... page-
 * builder template-preview URLs inside a duplicate group alongside the real
 * homepage): this check ONLY detects EXACT text matches, never near-
 * duplicates (two pages that are 90% identical, e.g. templated city/service
 * pages differing only in a swapped name, produce DIFFERENT hashes and are
 * NOT detected). This is a real, disclosed limitation, not a bug — see
 * lib/content/dimensions.ts's Duplicate Content status, which deliberately
 * never reports a clean result as a confident "Good" for exactly this
 * reason. Every page here already passed isContentEligiblePage (2xx HTML,
 * not noindex, self-canonical) — the audit concluded no FURTHER generic
 * (non-URL-pattern, non-CMS-specific) evidence is currently persisted that
 * reliably distinguishes a template/system artifact from a real content
 * page beyond that existing gate, so none is added here: a page whose own
 * evidence does not affirmatively disqualify it is treated as a genuine
 * finding, consistent with this shared gate's own documented
 * conservative/keep-by-default policy, rather than a new, unverified
 * URL-shape guess.
 *
 * PROMPT 3 UPDATE: a further generic evidence source has since been added
 * (lib/category-engine/eligibility.ts's hasLikelyAuxiliaryUrlSignal — the
 * exact WPR/Elementor case above is a page reached only via an internal
 * link and carrying a query string, which this signal now generically
 * captures without naming any platform). This does not exclude such pages —
 * they remain genuine, analyzed findings — but when EVERY page in a
 * duplicate group carries this signal, that specific group is more likely a
 * set of auxiliary/template variants than a real content-duplication
 * problem, so it pulls the whole finding's confidence down one notch
 * (never suppressed), mirroring substantively_thin_page's own established
 * "any low-confidence instance pulls the whole finding down" pattern.
 */
function groupByHash(pages: PageContext[]): Map<string, PageContext[]> {
  const groups = new Map<string, PageContext[]>()

  for (const pageContext of pages) {
    const hash = pageContext.page.content_hash
    if (!hash) continue

    const existing = groups.get(hash) ?? []
    existing.push(pageContext)
    groups.set(hash, existing)
  }

  return groups
}

export function analyzeExactDuplicateContent(context: AnalyzerContext): RawFinding[] {
  const groups = groupByHash(context.eligiblePages)
  const duplicateGroups = Array.from(groups.entries()).filter(([, pages]) => pages.length >= 2)

  if (duplicateGroups.length === 0) return []

  const instances: RawFindingPageEvidence[] = duplicateGroups.flatMap(([hash, pages]) =>
    pages.map(({ page }) => ({
      url: page.url,
      affectedResourceUrl: hash,
      currentState: { label: 'Content', value: page.content_text ? `${page.content_text.slice(0, 120)}…` : null },
      detail: { duplicateGroupSize: pages.length },
    }))
  )

  const affectedPageCount = instances.length
  const groupCount = duplicateGroups.length

  // Prompt 3 real-world false-positive protection — see this file's own
  // doc comment. A group is "likely auxiliary" only when EVERY page in it
  // carries the signal (not merely one) — a single auxiliary-looking page
  // duplicating a real content page is still worth reporting confidently.
  const hasLikelyAuxiliaryGroup = duplicateGroups.some(([, pages]) => pages.every(({ hasAuxiliaryUrlSignal }) => hasAuxiliaryUrlSignal))
  const confidence = hasLikelyAuxiliaryGroup ? 'medium' : 'high'

  return [
    {
      checkKey: 'exact_duplicate_content',
      category: 'duplication',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'high',
      confidence,
      title: 'Multiple pages have identical substantive content',
      explanation: `${affectedPageCount} page${affectedPageCount === 1 ? '' : 's'} webioom analyzed have word-for-word identical written content across ${groupCount} distinct group${groupCount === 1 ? '' : 's'} of duplicates. This is EXACT-match detection only — near-duplicate content (e.g. two pages that are mostly, but not word-for-word, identical) is not detected by this check.${hasLikelyAuxiliaryGroup ? ' At least one of these groups is made up of pages only reachable through internal links and carrying extra URL parameters, which are more often auto-generated variants than pages meant to stand on their own — webioom is less certain this group represents a real content problem.' : ''}`,
      whyItMatters:
        'Identical content across multiple pages gives visitors and search engines no reason to treat them as separate, valuable pages — this can dilute ranking signal and make it unclear which page should be found for a given search.',
      recommendation: 'Rewrite each affected page with unique, page-specific content, or consolidate duplicate pages into one and redirect the others.',
      evidence: {
        duplicateGroupCount: groupCount,
        affectedPageCount,
        includesLikelyAuxiliaryGroup: hasLikelyAuxiliaryGroup,
        groups: duplicateGroups.map(([hash, pages]) => ({ groupKey: hash, groupSize: pages.length, urls: pages.map(({ page }) => page.url) })),
      },
      affectedPages: instances,
    },
  ]
}
