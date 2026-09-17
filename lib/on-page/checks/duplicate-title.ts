import type { CrawlPageRow } from '@/lib/crawler/types'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 28 — duplicate titles. A capability the single-page legacy scanner
 * could never offer (it has no cross-page evidence to compare against) —
 * genuinely new, made possible by the crawler's multi-page persisted
 * evidence.
 *
 * GROUPING: pages are grouped by a normalized (trimmed, whitespace-
 * collapsed, case-INsensitive) comparison of `title` — two titles differing
 * only by case or incidental whitespace render nearly identically in a
 * search result and are treated as the same value for duplication purposes.
 * Only pages with a non-empty title participate (multiple pages each
 * MISSING a title are already covered by missing_title — grouping them
 * together here would misrepresent "nothing" as if it were a shared,
 * specific value).
 *
 * DUPLICATE-RESISTANT BY CONSTRUCTION: exactly ONE RawFindingPageEvidence
 * instance is emitted per AFFECTED PAGE (never one per pair), so a group of
 * 20 pages sharing one title contributes affectedPageCount = 20 and
 * occurrenceCount = 20 — never the C(20,2) = 190 pairwise penalties this
 * phase's own instructions explicitly warn against. Each instance's
 * `affectedResourceUrl` is set to the shared normalized title value itself
 * (a synthetic "target" identifying WHICH group a page belongs to) — this
 * reuses aggregate.ts's existing three-way affectedPageCount/occurrenceCount/
 * uniqueTargetCount counting mechanism (established in Phase 26B/27) for
 * free: uniqueTargetCount naturally becomes the number of DISTINCT
 * duplicate GROUPS, with zero new counting logic needed.
 *
 * PARTIAL CRAWL: NOT suppressed. Unlike Site Architecture's orphan/
 * underlinked checks (which need the WHOLE reachable graph to avoid
 * false-positives), a duplicate title observed among the pages actually
 * analyzed is a true, standalone fact regardless of how many other pages
 * remain unanalyzed — it just cannot be read as "the only duplicates on the
 * entire site." Wording below stays scoped to "the pages webioom analyzed"
 * rather than "your site" for exactly this reason (see
 * docs/on-page-seo-engine.md's "Partial crawl behavior" section).
 */
function normalizeForGrouping(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function groupByNormalizedTitle(pages: CrawlPageRow[]): Map<string, CrawlPageRow[]> {
  const groups = new Map<string, CrawlPageRow[]>()

  for (const page of pages) {
    if (!page.title || page.title.trim().length === 0) continue

    const key = normalizeForGrouping(page.title)
    const existing = groups.get(key) ?? []
    existing.push(page)
    groups.set(key, existing)
  }

  return groups
}

export function analyzeDuplicateTitles(context: AnalyzerContext): RawFinding[] {
  const groups = groupByNormalizedTitle(context.eligiblePages)
  const duplicateGroups = Array.from(groups.entries()).filter(([, pages]) => pages.length >= 2)

  if (duplicateGroups.length === 0) return []

  const instances: RawFindingPageEvidence[] = duplicateGroups.flatMap(([normalizedTitle, pages]) =>
    pages.map((page) => ({
      url: page.url,
      affectedResourceUrl: normalizedTitle,
      currentState: { label: 'Title', value: page.title },
      remediationType: 'content_field_replacement' as const,
      detail: { sharedTitle: page.title, duplicateGroupSize: pages.length },
    }))
  )

  const affectedPageCount = instances.length
  const groupCount = duplicateGroups.length

  return [
    {
      checkKey: 'duplicate_title',
      category: 'title',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Multiple pages share the same title',
      explanation: `${affectedPageCount} page${affectedPageCount === 1 ? '' : 's'} webioom analyzed share an identical title across ${groupCount} distinct group${groupCount === 1 ? '' : 's'} of duplicate values.`,
      whyItMatters: 'Identical titles make it harder for search engines to distinguish which of your pages is most relevant for a given search, and can dilute ranking signal across the duplicates instead of concentrating it on one clear page.',
      recommendation: 'Give each page a unique, page-specific title that accurately describes its own content.',
      evidence: {},
      affectedPages: instances,
    },
  ]
}
