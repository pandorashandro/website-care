import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'
import type { PageType } from '../page-purpose'

/**
 * Phase 29 — substantively thin content.
 *
 * NOT "if words < 300 => thin" as a single universal rule. Thresholds are
 * PAGE-TYPE-AWARE (see lib/content/page-purpose.ts): a contact page and a
 * homepage are legitimately allowed to be far shorter than an
 * article/service/unclassified page without that being a real problem.
 * Documented, not folklore:
 *
 * - contact: 40 words — an address, phone number, and a short form label
 *   is a complete, legitimate contact page.
 * - homepage: 60 words — homepages are often intentionally link-forward
 *   rather than prose-heavy, directing visitors elsewhere on the site.
 * - category: 40 words — a listing/index page is also legitimately
 *   link-forward (a grid of items/cards), not prose-heavy.
 * - product: 40 words — many legitimate product pages are photo/spec-table
 *   led with genuinely little prose; penalizing that would be a false
 *   positive against a normal, well-built product page.
 * - landing: 60 words — same link/CTA-forward reasoning as homepage. (No
 *   check currently classifies a page as 'landing' — see page-purpose.ts's
 *   own doc comment — but the threshold exists so this stays type-complete
 *   and correct the moment a future classifier does.)
 * - about: 100 words — a company can legitimately be concise, but an about
 *   page saying almost nothing about the business is a weaker signal than a
 *   contact/homepage page being link-forward.
 * - service: 150 words — a service page is expected to explain what is
 *   offered; same bar as 'unknown'.
 * - article: 300 words — a blog/article page is expected to be an actual
 *   piece of written content, not a stub.
 * - other/unknown: 150 words — the general expectation for a page whose
 *   type could not be conservatively determined; NEVER lowered just because
 *   the type is uncertain (that would let genuinely thin pages escape
 *   detection by being unclassifiable) — instead, CONFIDENCE is reduced
 *   instead of the threshold, per this phase's own explicit instruction.
 *
 * Word count is EVIDENCE, not a universal quality verdict — this is why the
 * finding's explanation names the page-type context. Confidence is reduced
 * when the page's type is unknown (or another low-reliability classification).
 *
 * REAL-WORLD EVIDENCE-QUALITY PASS: pages with 'low' extraction confidence
 * (lib/content/eligibility.ts's getExtractionConfidence) are now EXCLUDED
 * from this check entirely, not merely down-weighted — a real Bespoke crawl
 * proved that reporting "0 substantive words" at reduced confidence still
 * reads to a customer as a confident claim the page is empty, which this
 * phase's own instructions explicitly forbid when extraction evidence is
 * actually unreliable ("must not state '0 substantive words' as though it
 * proved the page contains no content... soften OR SUPPRESS"). These pages
 * are surfaced instead via the Content Depth dimension's own "limited
 * confidence" status (lib/content/dimensions.ts), never silently dropped.
 *
 * PAGE-LOCAL: valid for the analyzed page regardless of partial-crawl
 * status — not suppressed.
 */
const THIN_CONTENT_WORD_THRESHOLD: Record<PageType, number> = {
  contact: 40,
  homepage: 60,
  category: 40,
  product: 40,
  landing: 60,
  about: 100,
  service: 150,
  unknown: 150,
  other: 150,
  article: 300,
}

function explanationFor(pageType: PageType, wordCount: number, threshold: number): string {
  const typeLabel = pageType === 'unknown' ? 'this page' : `this ${pageType} page`
  return `${typeLabel} contains substantially less substantive text (${wordCount} word${wordCount === 1 ? '' : 's'} in paragraph content) than expected (around ${threshold}+ words) for its apparent purpose. Important information may be missing.`
}

export function analyzeThinContent(context: AnalyzerContext): RawFinding[] {
  const instances: RawFindingPageEvidence[] = []
  let anyLowConfidence = false
  let single: { pageType: PageType; wordCount: number; threshold: number } | null = null

  for (const { page, pageType, extractionConfidence } of context.eligiblePages) {
    if (extractionConfidence === 'low') continue

    const threshold = THIN_CONTENT_WORD_THRESHOLD[pageType.type]
    const wordCount = page.content_word_count

    if (wordCount >= threshold) continue

    // Uses the page-type classifier's OWN reported confidence, rather than
    // hardcoding "type === 'unknown'" — automatically covers any future
    // low-confidence classification, not just the one that exists today.
    const lowConfidence = pageType.confidence === 'low'
    if (lowConfidence) anyLowConfidence = true
    single = { pageType: pageType.type, wordCount, threshold }

    instances.push({
      url: page.url,
      currentState: { label: 'Substantive word count', value: String(wordCount) },
      desiredState: { label: 'Expected minimum for this page type', value: `${threshold}+ words` },
      detail: { pageType: pageType.type, wordCount, threshold, extractionConfidence },
    })
  }

  if (instances.length === 0) return []

  // Confidence is per-check (aggregate.ts merges to the MINIMUM across
  // instances), so a single low-confidence instance (unknown page type)
  // conservatively pulls the whole finding's reported confidence down —
  // never overstate certainty for the group because most instances
  // happened to be confident ones.
  const confidence = anyLowConfidence ? 'medium' : 'high'

  return [
    {
      checkKey: 'substantively_thin_page',
      category: 'thinness',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence,
      title: 'Pages contain substantially less content than expected',
      explanation:
        instances.length === 1 && single
          ? explanationFor(single.pageType, single.wordCount, single.threshold)
          : `${instances.length} pages contain substantially less substantive text than expected for their apparent purpose. Important information may be missing.`,
      whyItMatters:
        'Pages with very little substantive content often fail to fully answer a visitor\'s question, which can also make it harder for search engines to understand what the page offers relative to more complete competing pages.',
      recommendation: 'Review these pages and expand them with the specific information a visitor would need for this type of page (details, context, next steps).',
      evidence: {},
      affectedPages: instances,
    },
  ]
}
