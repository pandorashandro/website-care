import type { RawFinding } from './types'

/**
 * Phase 27, Section D — internal-link opportunity FOUNDATION only.
 *
 * The long-term product goal is a contextual suggestion: "on page A, near
 * this sentence, link to page B with this anchor text." Generating that
 * responsibly requires semantic understanding of each page's actual
 * content (what it is about, where a relevant mention already exists) —
 * evidence Phase 25's crawler does NOT currently persist. crawl_pages
 * stores only title/meta description/first H1/canonical — never the page's
 * full body text or any per-paragraph context. There is no honest way to
 * generate a "relevant sentence or section" suggestion from that evidence
 * without fabricating semantic relevance, which this phase's own
 * instructions explicitly forbid ("DO NOT fabricate semantic relevance if
 * the current crawl evidence does not contain enough page-content/context
 * information").
 *
 * What IS built now (the "foundation"):
 * - `internal_link_opportunity` exists as a reserved CheckKey
 *   (lib/architecture/types.ts) and as a classified entry in
 *   actionability.ts (guided_fix) — the moment real semantic evidence
 *   exists (Content Intelligence, a future phase), an analyzer can start
 *   emitting this key and it flows through the exact same aggregation/
 *   persistence/UI pipeline as every other finding, with no schema or
 *   contract change required.
 * - `RemediationType` and `RawFindingPageEvidence` (both in
 *   lib/category-engine/types.ts) already support everything an
 *   opportunity would need to express: `currentState`/`desiredState` for
 *   "no internal link exists yet" -> "suggested link," `proposedChange`
 *   for the suggested anchor/destination text, and `detail` for a
 *   confidence/context payload.
 *
 * What is NOT built (deferred to Content Intelligence / Safe Fix 2.0):
 * - Any actual opportunity generation. This function always returns an
 *   empty array — it exists so run-analysis.ts has one clear place to wire
 *   in real generation later without restructuring the analyzer pipeline,
 *   and so this deliberate absence is documented in code, not just prose.
 */
export function analyzeLinkOpportunities(): RawFinding[] {
  return []
}
