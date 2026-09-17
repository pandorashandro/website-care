import { classifyMetaDescriptionLength, META_DESCRIPTION_MIN_LENGTH, META_DESCRIPTION_MAX_LENGTH } from '@/lib/scanner/meta-description-rules'
import type { AnalyzerContext } from '../context'
import type { RawFinding, RawFindingPageEvidence } from '../types'

/**
 * Phase 28 — meta description presence/length. Reuses
 * lib/scanner/meta-description-rules.ts's `classifyMetaDescriptionLength`
 * verbatim, exactly mirroring title.ts's own reasoning for reusing
 * title-rules.ts — one centralized, already-tested source of truth shared
 * with the existing meta-description Prepare-Fix verifier, not a fresh
 * threshold invented for this phase.
 *
 * Missing is MEDIUM severity (a real problem, but search engines can and do
 * generate a usable auto-snippet from page content when no description
 * exists — a materially softer failure mode than a missing title, which has
 * no equivalent fallback). Length findings are LOW severity, consistent
 * with title.ts's own "length is a display heuristic, not a hard error"
 * reasoning.
 *
 * PAGE-LOCAL, not suppressed on a partial crawl.
 */
export function analyzeMetaDescriptionLength(context: AnalyzerContext): RawFinding[] {
  const missing: RawFindingPageEvidence[] = []
  const tooShort: RawFindingPageEvidence[] = []
  const tooLong: RawFindingPageEvidence[] = []

  for (const page of context.eligiblePages) {
    const status = classifyMetaDescriptionLength(page.meta_description)
    if (status === 'ok') continue

    const instance: RawFindingPageEvidence = {
      url: page.url,
      currentState: { label: 'Meta description', value: page.meta_description },
      detail: { metaDescriptionLength: page.meta_description?.length ?? 0 },
    }

    if (status === 'missing') missing.push(instance)
    else if (status === 'too_short') tooShort.push(instance)
    else if (status === 'too_long') tooLong.push(instance)
  }

  const findings: RawFinding[] = []

  if (missing.length > 0) {
    findings.push({
      checkKey: 'missing_meta_description',
      category: 'meta_description',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages have no meta description',
      explanation: `${missing.length} page${missing.length === 1 ? '' : 's'} webioom analyzed ${missing.length === 1 ? 'has' : 'have'} no meta description.`,
      whyItMatters: 'Search engines may generate their own snippet from other page content, and the page loses control over how it is presented in search results.',
      recommendation: 'Create a concise, page-specific description accurately summarizing the page.',
      evidence: {},
      affectedPages: missing.map((instance) => ({
        ...instance,
        desiredState: { label: 'Meta description', value: `A page-specific summary, ${META_DESCRIPTION_MIN_LENGTH}-${META_DESCRIPTION_MAX_LENGTH} characters` },
        remediationType: 'content_field_replacement',
      })),
    })
  }

  if (tooShort.length > 0) {
    findings.push({
      checkKey: 'meta_description_too_short',
      category: 'meta_description',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Meta descriptions are too short',
      explanation: `${tooShort.length} page${tooShort.length === 1 ? '' : 's'} webioom analyzed ${tooShort.length === 1 ? 'has' : 'have'} a meta description under ${META_DESCRIPTION_MIN_LENGTH} characters.`,
      whyItMatters: 'A very short description under-uses the space search engines display, offering less context to someone deciding whether to click through.',
      recommendation: `Expand the description to roughly ${META_DESCRIPTION_MIN_LENGTH}-${META_DESCRIPTION_MAX_LENGTH} characters.`,
      evidence: {},
      affectedPages: tooShort.map((instance) => ({ ...instance, remediationType: 'content_field_replacement' })),
    })
  }

  if (tooLong.length > 0) {
    findings.push({
      checkKey: 'meta_description_too_long',
      category: 'meta_description',
      scope: 'page',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Meta descriptions are too long',
      explanation: `${tooLong.length} page${tooLong.length === 1 ? '' : 's'} webioom analyzed ${tooLong.length === 1 ? 'has' : 'have'} a meta description over ${META_DESCRIPTION_MAX_LENGTH} characters.`,
      whyItMatters: "A very long description risks being cut off in search results.",
      recommendation: `Shorten the description to under ${META_DESCRIPTION_MAX_LENGTH} characters so it isn't cut off in search results.`,
      evidence: {},
      affectedPages: tooLong.map((instance) => ({ ...instance, remediationType: 'content_field_replacement' })),
    })
  }

  return findings
}
