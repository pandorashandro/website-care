import type { Severity, Confidence } from './types'

/**
 * Phase 27 — promoted from lib/technical-seo/severity.ts (Phase 26)
 * unchanged, once a second category engine (lib/architecture/) needed the
 * exact same severity-adjustment rules. Nothing here is Technical-SEO-
 * specific — it operates purely on the generic Severity/Confidence
 * vocabulary. lib/technical-seo/severity.ts now re-exports this module, so
 * no existing Technical SEO import needed to change.
 *
 * Severity ADJUSTMENT rules, applied once at aggregation time (after every
 * analyzer's raw per-instance findings for one check have been grouped into
 * a single candidate finding). Each analyzer already assigns a
 * `baseSeverity` reflecting how bad ONE instance of the problem is in
 * isolation; this function is the one place scope (site-wide vs isolated),
 * spread (affected page count), and confidence adjust that base severity
 * into what actually gets persisted and shown.
 *
 * Documented rules, in order:
 *
 * 1. LOW-CONFIDENCE OBSERVATIONS ARE NEVER SHOWN AS CRITICAL/HIGH. A finding
 *    the analyzer itself is not confident about is capped at 'medium',
 *    regardless of how severe the underlying condition would be if certain
 *    — "do not show low-confidence observations as critical errors."
 * 2. WIDESPREAD 'high' CONDITIONS MAY ESCALATE TO 'critical'. If a 'high'
 *    finding affects at least half of the pages this analysis actually
 *    covered, it escalates to 'critical' — a condition hitting most of a
 *    (partially or fully crawled) site is a materially different problem
 *    than the same condition on one page. This is the ONLY escalation rule.
 * 3. NO OTHER ESCALATION, AND NO AUTOMATIC DE-ESCALATION BY COUNT. A single
 *    affected page never gets a severity bump just for being alone (a lone
 *    broken homepage is still genuinely critical), and 'medium'/'low'
 *    findings never escalate no matter how many pages they affect — this is
 *    the "avoid severity inflation" / "not every missing optional signal is
 *    High/Critical" rule. Widening the blast radius of an already-minor
 *    issue does not make it a major one.
 *
 * `totalAnalyzedPages` is the count of pages an analysis actually
 * evaluated — using the crawl's own completed-page count, not
 * effective_page_budget, so a partial crawl's spread percentage is judged
 * against what was actually seen, not against pages that were never
 * reached.
 */
const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const SEVERITY_BY_RANK: Severity[] = ['low', 'medium', 'high', 'critical']

function capAt(severity: Severity, ceiling: Severity): Severity {
  return SEVERITY_RANK[severity] > SEVERITY_RANK[ceiling] ? ceiling : severity
}

function escalate(severity: Severity): Severity {
  const nextRank = Math.min(SEVERITY_RANK[severity] + 1, SEVERITY_BY_RANK.length - 1)
  return SEVERITY_BY_RANK[nextRank]
}

export const WIDESPREAD_FRACTION_THRESHOLD = 0.5

export function adjustSeverity(
  baseSeverity: Severity,
  confidence: Confidence,
  affectedPageCount: number,
  totalAnalyzedPages: number
): Severity {
  let severity = baseSeverity

  if (confidence === 'low') {
    severity = capAt(severity, 'medium')
  }

  const isWidespread = totalAnalyzedPages > 0 && affectedPageCount / totalAnalyzedPages >= WIDESPREAD_FRACTION_THRESHOLD

  if (severity === 'high' && isWidespread) {
    severity = escalate(severity)
  }

  return severity
}
