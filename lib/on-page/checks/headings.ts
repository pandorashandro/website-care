import type { AnalyzerContext } from '../context'
import type { RawFinding } from '../types'

/**
 * Phase 28 — H1 presence and count.
 *
 * MISSING: fires when a page has no <h1> at all (h1_count === 0) OR has an
 * H1 element whose text is empty/whitespace-only after trimming — an empty
 * H1 tag provides no more page-specific signal than no H1 at all, so both
 * are folded into the same "missing" finding rather than adding a separate
 * "empty H1" check (kept to the "quality over quantity" instruction: a
 * genuinely distinct empty-vs-absent finding would not change what the
 * customer should do differently).
 *
 * MULTIPLE: fires when h1_count >= 2, REGARDLESS of what the first H1's
 * text says — this is a Phase 28 crawler-evidence addition
 * (crawl_pages.h1_count; see lib/crawler/page-extract.ts and the migration's
 * own comment) needed because h1_text alone only ever stores the first H1's
 * text and cannot distinguish "exactly one H1" from "several, first one
 * shown."
 *
 * Both are deterministic, directly-observed facts (a literal element count),
 * not a content-quality judgment — no heading-hierarchy (H2-H6 nesting)
 * analysis is implemented here; see docs/on-page-seo-engine.md's "Deferred"
 * section for why that would require a genuinely new, larger crawler
 * evidence expansion this phase's own "do not turn Phase 28 into a crawler
 * rewrite" instruction rules out.
 *
 * PAGE-LOCAL, not suppressed on a partial crawl: a page's own heading
 * structure is fully known once that page itself was fetched.
 */
export function analyzeHeadingStructure(context: AnalyzerContext): RawFinding[] {
  const missingH1 = context.eligiblePages.filter((page) => page.h1_count === 0 || !page.h1_text || page.h1_text.trim().length === 0)
  const multipleH1 = context.eligiblePages.filter((page) => page.h1_count >= 2)

  const findings: RawFinding[] = []

  if (missingH1.length > 0) {
    findings.push({
      checkKey: 'missing_h1',
      category: 'headings',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages have no H1 heading',
      explanation: `${missingH1.length} page${missingH1.length === 1 ? '' : 's'} webioom analyzed ${missingH1.length === 1 ? 'has' : 'have'} no (or an empty) <h1> heading.`,
      whyItMatters: 'An H1 heading tells visitors and search engines what a page is about at a glance — without one, the page loses a strong, page-specific relevance signal.',
      recommendation: 'Add a single, descriptive <h1> heading summarizing the page.',
      evidence: {},
      affectedPages: missingH1.map((page) => ({
        url: page.url,
        currentState: { label: 'H1 heading', value: page.h1_text && page.h1_text.trim().length > 0 ? page.h1_text : null },
        desiredState: { label: 'H1 heading', value: 'A single, descriptive heading' },
        remediationType: 'content_field_replacement',
        detail: { h1Count: page.h1_count },
      })),
    })
  }

  if (multipleH1.length > 0) {
    findings.push({
      checkKey: 'multiple_h1',
      category: 'headings',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages have multiple H1 headings',
      explanation: `${multipleH1.length} page${multipleH1.length === 1 ? '' : 's'} webioom analyzed ${multipleH1.length === 1 ? 'has' : 'have'} more than one <h1> heading.`,
      whyItMatters: 'Multiple H1s dilute which single heading search engines should treat as the page\'s main topic, and can indicate an inconsistent heading structure.',
      recommendation: 'Use only one <h1> per page for the page\'s main heading, and use <h2>/<h3> for subheadings.',
      evidence: {},
      affectedPages: multipleH1.map((page) => ({
        url: page.url,
        currentState: { label: 'Number of H1 headings', value: String(page.h1_count) },
        desiredState: { label: 'Number of H1 headings', value: '1' },
        detail: { h1Count: page.h1_count, firstH1Text: page.h1_text },
      })),
    })
  }

  return findings
}
