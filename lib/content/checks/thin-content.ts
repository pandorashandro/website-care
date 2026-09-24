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

/**
 * Scoring Engine V1 calibration (2026-09-24) — a page at 55/60 expected
 * words and a page at 5/60 expected words were previously reported as the
 * SAME flat 'medium' severity, even though the second is barely content at
 * all. Per `docs/category-score-standard.md`'s own Property 5 ("severity
 * must be allowed to escalate when the evidence genuinely supports a worse
 * conclusion"), a page with LESS THAN HALF its page-type's already-
 * page-type-calibrated expected minimum is a categorically worse signal —
 * not simply "a bit short," but "barely any substantive content exists at
 * all" — and is reported as its own, higher-severity instance, mirroring
 * the exact SAME-checkKey/split-by-severity pattern
 * lib/technical-seo/checks/crawlability.ts already uses for
 * `internal_page_4xx` (a 404 vs. another 4xx status under one checkKey,
 * different severities). This is a deduction-calibration fix, not a
 * competing "evidence ceiling" — the score a critically thin page earns
 * now comes entirely from ONE evidence-traceable, page-type-aware rule.
 */
const CRITICALLY_THIN_FRACTION = 0.5

export function analyzeThinContent(context: AnalyzerContext): RawFinding[] {
  const critical: RawFindingPageEvidence[] = []
  const moderate: RawFindingPageEvidence[] = []
  let anyLowConfidenceCritical = false
  let anyLowConfidenceModerate = false
  let singleCritical: { pageType: PageType; wordCount: number; threshold: number } | null = null
  let singleModerate: { pageType: PageType; wordCount: number; threshold: number } | null = null

  for (const { page, pageType, extractionConfidence } of context.eligiblePages) {
    if (extractionConfidence === 'low') continue

    const threshold = THIN_CONTENT_WORD_THRESHOLD[pageType.type]
    const wordCount = page.content_word_count

    if (wordCount >= threshold) continue

    // Uses the page-type classifier's OWN reported confidence, rather than
    // hardcoding "type === 'unknown'" — automatically covers any future
    // low-confidence classification, not just the one that exists today.
    const lowConfidence = pageType.confidence === 'low'
    const instance: RawFindingPageEvidence = {
      url: page.url,
      currentState: { label: 'Substantive word count', value: String(wordCount) },
      desiredState: { label: 'Expected minimum for this page type', value: `${threshold}+ words` },
      detail: { pageType: pageType.type, wordCount, threshold, extractionConfidence },
    }

    if (wordCount < threshold * CRITICALLY_THIN_FRACTION) {
      critical.push(instance)
      if (lowConfidence) anyLowConfidenceCritical = true
      singleCritical = { pageType: pageType.type, wordCount, threshold }
    } else {
      moderate.push(instance)
      if (lowConfidence) anyLowConfidenceModerate = true
      singleModerate = { pageType: pageType.type, wordCount, threshold }
    }
  }

  const findings: RawFinding[] = []

  if (critical.length > 0) {
    findings.push({
      checkKey: 'substantively_thin_page',
      category: 'thinness',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'high',
      // Confidence is per-check (aggregate.ts merges to the MINIMUM across
      // instances), so a single low-confidence instance conservatively
      // pulls the whole finding's reported confidence down.
      confidence: anyLowConfidenceCritical ? 'medium' : 'high',
      title: 'Pages contain barely any substantive content',
      explanation:
        critical.length === 1 && singleCritical
          ? explanationFor(singleCritical.pageType, singleCritical.wordCount, singleCritical.threshold)
          : `${critical.length} pages contain less than half the substantive text expected for their apparent purpose — barely any content at all. Important information is very likely missing.`,
      whyItMatters:
        'A page with barely any substantive content rarely answers a visitor\'s question at all, and gives search engines almost nothing to understand what the page offers relative to competing pages.',
      recommendation: 'Review these pages and add the specific information a visitor would need for this type of page (details, context, next steps).',
      evidence: {},
      affectedPages: critical,
    })
  }

  if (moderate.length > 0) {
    findings.push({
      checkKey: 'substantively_thin_page',
      category: 'thinness',
      scope: 'page',
      kind: 'problem',
      evidenceSource: 'deterministic',
      baseSeverity: 'medium',
      confidence: anyLowConfidenceModerate ? 'medium' : 'high',
      title: 'Pages contain substantially less content than expected',
      explanation:
        moderate.length === 1 && singleModerate
          ? explanationFor(singleModerate.pageType, singleModerate.wordCount, singleModerate.threshold)
          : `${moderate.length} pages contain substantially less substantive text than expected for their apparent purpose. Important information may be missing.`,
      whyItMatters:
        'Pages with very little substantive content often fail to fully answer a visitor\'s question, which can also make it harder for search engines to understand what the page offers relative to more complete competing pages.',
      recommendation: 'Review these pages and expand them with the specific information a visitor would need for this type of page (details, context, next steps).',
      evidence: {},
      affectedPages: moderate,
    })
  }

  return findings
}
