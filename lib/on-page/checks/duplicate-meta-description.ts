import type { CrawlPageRow } from '@/lib/crawler/types'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 28 — duplicate meta descriptions. Mirrors duplicate-title.ts's
 * grouping/duplicate-resistance/partial-crawl reasoning exactly (see that
 * file's own doc comment for the full explanation) — the only difference is
 * the field being compared and a MEDIUM base severity rather than HIGH,
 * consistent with meta-description.ts's own "missing description is a
 * softer failure than missing title" reasoning: a duplicated description is
 * a real but comparatively lower-impact problem than a duplicated title.
 */
function normalizeForGrouping(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function groupByNormalizedDescription(pages: CrawlPageRow[]): Map<string, CrawlPageRow[]> {
  const groups = new Map<string, CrawlPageRow[]>()

  for (const page of pages) {
    if (!page.meta_description || page.meta_description.trim().length === 0) continue

    const key = normalizeForGrouping(page.meta_description)
    const existing = groups.get(key) ?? []
    existing.push(page)
    groups.set(key, existing)
  }

  return groups
}

export function analyzeDuplicateMetaDescriptions(context: AnalyzerContext): RawFinding[] {
  const groups = groupByNormalizedDescription(context.eligiblePages)
  const duplicateGroups = Array.from(groups.entries()).filter(([, pages]) => pages.length >= 2)

  if (duplicateGroups.length === 0) return []

  const instances: RawFindingPageEvidence[] = duplicateGroups.flatMap(([normalizedDescription, pages]) =>
    pages.map((page) => ({
      url: page.url,
      affectedResourceUrl: normalizedDescription,
      currentState: { label: 'Meta description', value: page.meta_description },
      remediationType: 'content_field_replacement' as const,
      detail: { sharedMetaDescription: page.meta_description, duplicateGroupSize: pages.length },
    }))
  )

  const affectedPageCount = instances.length
  const groupCount = duplicateGroups.length

  return [
    {
      checkKey: 'duplicate_meta_description',
      category: 'meta_description',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Multiple pages share the same meta description',
      explanation: `${affectedPageCount} page${affectedPageCount === 1 ? '' : 's'} webioom analyzed share an identical meta description across ${groupCount} distinct group${groupCount === 1 ? '' : 's'} of duplicate values.`,
      whyItMatters: 'Identical descriptions give search engines and searchers no way to tell your pages apart in a results list, weakening each page\'s individual search presentation.',
      recommendation: 'Write a unique, page-specific description for each affected page.',
      evidence: {},
      affectedPages: instances,
    },
  ]
}
