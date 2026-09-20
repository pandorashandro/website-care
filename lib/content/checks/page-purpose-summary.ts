import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'
import type { PageType } from '../page-purpose'

/**
 * Phase 29 — Page Purpose, the 7th canonical Content Intelligence report
 * dimension. Per this phase's own explicit instruction, "Page Purpose
 * itself does not necessarily reduce health... it is intelligence used by
 * other dimensions" — this check is `kind: 'opportunity'` (zero score
 * impact, always, per lib/content/health.ts) purely to surface the
 * classification breakdown as genuine, inspectable evidence rather than
 * silently computing it and showing nothing.
 *
 * Deliberately ALWAYS emitted when at least one eligible page exists (not
 * conditioned on finding a "problem") — this is an INFORMATIONAL summary,
 * not a defect detector. Confidence reflects how much of the analyzed
 * population the (deliberately narrow — see lib/content/page-purpose.ts)
 * classifier could actually classify: 'high' when the majority of pages
 * got a real classification, 'low' when most remain 'unknown' (honest about
 * the classifier's own narrow scope, never overclaiming coverage).
 *
 * PAGE-LOCAL by construction (each page keeps its own classification), not
 * suppressed on a partial crawl — a page's own purpose is determined from
 * its own evidence regardless of how much of the rest of the site was
 * reached.
 *
 * DOUBLES AS THE ANALYSIS-SCOPE RECORD: because this check is the only one
 * unconditionally emitted for every eligible page, its own
 * `affected_page_count` is exactly the eligible-page count, and its
 * `evidence` additionally records how many of those pages had 'low'
 * extraction confidence — lib/content/dimensions.ts (the dedicated Content
 * page's dimension-status computation) reads BOTH of these directly from
 * this ONE persisted finding rather than needing separate new persistence
 * for "how many pages were eligible"/"how many had reliable extraction."
 */
/** A page substantive enough that structure/FAQ checks actually evaluate it — see thin-content.ts's own 'unknown'/'service' threshold (the highest non-article bar), reused here as the shared "was there enough to meaningfully check" floor for the free scope record below. */
const SUBSTANTIVE_EVALUATION_FLOOR = 150

export function analyzePagePurposeSummary(context: AnalyzerContext): RawFinding[] {
  if (context.eligiblePages.length === 0) return []

  const counts: Record<PageType, number> = {
    homepage: 0,
    contact: 0,
    about: 0,
    service: 0,
    product: 0,
    article: 0,
    category: 0,
    landing: 0,
    other: 0,
    unknown: 0,
  }
  let lowExtractionConfidenceCount = 0
  let substantiveEligiblePageCount = 0
  for (const { page, pageType, extractionConfidence } of context.eligiblePages) {
    counts[pageType.type]++
    if (extractionConfidence === 'low') lowExtractionConfidenceCount++
    if (extractionConfidence === 'high' && page.content_word_count >= SUBSTANTIVE_EVALUATION_FLOOR) substantiveEligiblePageCount++
  }

  const classifiedCount = context.eligiblePages.length - counts.unknown
  const classifiedFraction = classifiedCount / context.eligiblePages.length
  const confidence = classifiedFraction >= 0.5 ? 'high' : 'low'

  const nonZeroBreakdown = (Object.entries(counts) as [PageType, number][])
    .filter(([type, count]) => type !== 'unknown' && count > 0)
    .map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`)
  const breakdownText = nonZeroBreakdown.length > 0 ? `${nonZeroBreakdown.join(', ')}, and ${counts.unknown} unclassified` : `${counts.unknown} unclassified`

  return [
    {
      checkKey: 'page_purpose_summary',
      category: 'page_purpose',
      scope: 'site',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence,
      title: 'Page purpose classification',
      explanation: `Of ${context.eligiblePages.length} pages analyzed, webioom classified: ${breakdownText} (purpose not confidently determined from available evidence).`,
      whyItMatters:
        'Page purpose is used internally to set reasonable content-depth expectations per page type (e.g. a contact page is not expected to be as long as a service page) — it does not by itself indicate a problem.',
      recommendation: 'No action needed — this is informational context for how other Content findings were evaluated.',
      evidence: {
        homepageCount: counts.homepage,
        contactCount: counts.contact,
        aboutCount: counts.about,
        serviceCount: counts.service,
        productCount: counts.product,
        articleCount: counts.article,
        categoryCount: counts.category,
        landingCount: counts.landing,
        otherCount: counts.other,
        unknownCount: counts.unknown,
        lowExtractionConfidenceCount,
        eligiblePageCount: context.eligiblePages.length,
        substantiveEligiblePageCount,
      },
      affectedPages: context.eligiblePages.map(({ page, pageType }) => ({
        url: page.url,
        currentState: { label: 'Classified purpose', value: pageType.type },
        detail: { pageType: pageType.type, pageTypeConfidence: pageType.confidence },
      })),
    },
  ]
}
