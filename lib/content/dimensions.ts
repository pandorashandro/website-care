/**
 * Phase 29 — the 12 canonical Content Intelligence report dimensions. This
 * is the LOCKED product requirement's own dimension list, mapped onto
 * whatever this analyzer version actually evaluated. A pure function
 * (no I/O) so it is fully unit-testable and so the dedicated Content page
 * never has to guess which dimensions were genuinely assessed versus
 * silently omitted.
 *
 * CORE RULE: a dimension is reported as 'healthy'/'findings'/'opportunities'
 * ONLY when this analyzer version genuinely has a check (or a well-defined
 * derivation from other checks) backing that conclusion. Every other
 * dimension is honestly 'not_assessed' — never a fabricated "Good" (this
 * phase's own explicit "no fake Good for unassessed dimension" instruction).
 */
export type DimensionKey =
  | 'content_depth'
  | 'content_completeness'
  | 'quality_clarity'
  | 'duplicate_content'
  | 'repetitive_content'
  | 'content_structure'
  | 'page_purpose'
  | 'faq_coverage'
  | 'topical_coverage'
  | 'content_differentiation'
  | 'content_freshness'
  | 'content_opportunities'

export type DimensionStatus = 'healthy' | 'findings' | 'opportunities' | 'limited_confidence' | 'not_assessed'

export type DimensionResult = {
  key: DimensionKey
  label: string
  status: DimensionStatus
  /** One-line, plain-language explanation of the status — never a bare status word alone. */
  summary: string
  /** Which persisted check_key(s) this dimension's conclusion is derived from, for evidence drill-down. Empty when not_assessed. */
  relatedCheckKeys: string[]
}

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  content_depth: 'Content Depth',
  content_completeness: 'Content Completeness',
  quality_clarity: 'Content Quality & Clarity',
  duplicate_content: 'Duplicate Content',
  repetitive_content: 'Repetitive / Boilerplate Content',
  content_structure: 'Content Structure',
  page_purpose: 'Page Purpose',
  faq_coverage: 'FAQ / Question Coverage',
  topical_coverage: 'Topical Coverage',
  content_differentiation: 'Content Differentiation',
  content_freshness: 'Content Freshness',
  content_opportunities: 'Content Opportunities',
}

type FindingLike = { checkKey: string; kind: 'problem' | 'opportunity'; evidence?: Record<string, unknown> }

export type DimensionInput = {
  findings: FindingLike[]
  eligiblePageCount: number
}

const MIN_PAGES_FOR_REPETITION_PATTERN = 5

function findByCheckKey(findings: FindingLike[], checkKey: string): FindingLike | undefined {
  return findings.find((f) => f.checkKey === checkKey)
}

/**
 * Extracts eligiblePageCount/lowExtractionConfidenceCount from the
 * page_purpose_summary finding's own evidence when present (see
 * lib/content/checks/page-purpose-summary.ts's own doc comment for why
 * that ONE unconditional finding doubles as the analysis-scope record) —
 * falls back to the caller-supplied `eligiblePageCount` when that finding
 * is absent (e.g. zero eligible pages at all).
 */
function readScopeEvidence(
  findings: FindingLike[],
  fallbackEligibleCount: number
): { eligiblePageCount: number; lowExtractionConfidenceCount: number; substantiveEligiblePageCount: number } {
  const purposeFinding = findByCheckKey(findings, 'page_purpose_summary')
  const evidence = purposeFinding?.evidence ?? {}
  const eligiblePageCount = typeof evidence.eligiblePageCount === 'number' ? evidence.eligiblePageCount : fallbackEligibleCount
  const lowExtractionConfidenceCount = typeof evidence.lowExtractionConfidenceCount === 'number' ? evidence.lowExtractionConfidenceCount : 0
  // Falls back to eligiblePageCount (not 0) when absent — e.g. an older
  // persisted finding predating this field — so the absence of NEW evidence
  // never silently downgrades an otherwise-healthy result to not_assessed.
  const substantiveEligiblePageCount = typeof evidence.substantiveEligiblePageCount === 'number' ? evidence.substantiveEligiblePageCount : eligiblePageCount
  return { eligiblePageCount, lowExtractionConfidenceCount, substantiveEligiblePageCount }
}

export function computeDimensionStatuses(input: DimensionInput): DimensionResult[] {
  const { findings } = input
  const { eligiblePageCount, lowExtractionConfidenceCount, substantiveEligiblePageCount } = readScopeEvidence(findings, input.eligiblePageCount)
  const noEligiblePages = eligiblePageCount === 0
  const noSubstantivePages = substantiveEligiblePageCount === 0

  const results: DimensionResult[] = []

  // 1. Content Depth <- substantively_thin_page
  {
    const finding = findByCheckKey(findings, 'substantively_thin_page')
    const lowConfidenceFraction = eligiblePageCount > 0 ? lowExtractionConfidenceCount / eligiblePageCount : 0
    if (noEligiblePages) {
      results.push({ key: 'content_depth', label: DIMENSION_LABELS.content_depth, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else if (finding) {
      results.push({ key: 'content_depth', label: DIMENSION_LABELS.content_depth, status: 'findings', summary: 'Some pages contain substantially less content than expected for their purpose.', relatedCheckKeys: ['substantively_thin_page'] })
    } else if (lowConfidenceFraction >= 0.3) {
      results.push({
        key: 'content_depth',
        label: DIMENSION_LABELS.content_depth,
        status: 'limited_confidence',
        summary: `${lowExtractionConfidenceCount} of ${eligiblePageCount} pages had unreliable content extraction — their depth could not be confidently assessed.`,
        relatedCheckKeys: [],
      })
    } else {
      results.push({ key: 'content_depth', label: DIMENSION_LABELS.content_depth, status: 'healthy', summary: 'No pages were found to have substantially less content than expected.', relatedCheckKeys: [] })
    }
  }

  // 2. Content Completeness <- content_completeness_gap / content_completeness_opportunity (AI-derived, not live by default)
  {
    const problemFinding = findByCheckKey(findings, 'content_completeness_gap')
    const opportunityFinding = findByCheckKey(findings, 'content_completeness_opportunity')
    if (problemFinding) {
      results.push({ key: 'content_completeness', label: DIMENSION_LABELS.content_completeness, status: 'findings', summary: 'Some pages may be missing information visitors typically need.', relatedCheckKeys: ['content_completeness_gap'] })
    } else if (opportunityFinding) {
      results.push({ key: 'content_completeness', label: DIMENSION_LABELS.content_completeness, status: 'opportunities', summary: 'Some pages could cover a bit more ground for visitors.', relatedCheckKeys: ['content_completeness_opportunity'] })
    } else {
      results.push({
        key: 'content_completeness',
        label: DIMENSION_LABELS.content_completeness,
        status: 'not_assessed',
        summary:
          'Not enough reliable evidence to assess this yet — AI-assisted review either found no substantive, reliably-extracted candidate pages to evaluate, was unavailable this run, or found nothing notable to report.',
        relatedCheckKeys: [],
      })
    }
  }

  // 3. Content Quality & Clarity — never assessed in this analyzer version.
  results.push({
    key: 'quality_clarity',
    label: DIMENSION_LABELS.quality_clarity,
    status: 'not_assessed',
    summary: 'Not enough reliable evidence to assess this yet — judging clarity/coherence requires semantic interpretation this analyzer version does not perform.',
    relatedCheckKeys: [],
  })

  // 4. Duplicate Content <- exact_duplicate_content
  //
  // HONEST V1 (Phase 29 targeted completion pass): this check only detects
  // EXACT text matches. A clean result never claims general duplicate-
  // content health — near-duplicate content (e.g. templated pages that are
  // 90% identical) is a real, common pattern this check cannot see, so a
  // clean result is reported as 'limited_confidence', never a confident
  // 'healthy', per this phase's own minimum-evidence rule (a broad "Good"
  // requires no known major blind spot that would make the claim
  // misleading — near-duplicate blindness IS exactly such a blind spot).
  {
    const finding = findByCheckKey(findings, 'exact_duplicate_content')
    if (noEligiblePages) {
      results.push({ key: 'duplicate_content', label: DIMENSION_LABELS.duplicate_content, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else if (finding) {
      results.push({ key: 'duplicate_content', label: DIMENSION_LABELS.duplicate_content, status: 'findings', summary: 'Some pages have word-for-word identical substantive content.', relatedCheckKeys: ['exact_duplicate_content'] })
    } else {
      results.push({
        key: 'duplicate_content',
        label: DIMENSION_LABELS.duplicate_content,
        status: 'limited_confidence',
        summary: 'No EXACT duplicate substantive content was found among analyzed pages. This does not check for near-duplicate content (pages that are mostly, but not word-for-word, identical) — that detection does not exist yet.',
        relatedCheckKeys: [],
      })
    }
  }

  // 5. Repetitive / Boilerplate Content <- highly_repetitive_page
  {
    const finding = findByCheckKey(findings, 'highly_repetitive_page')
    if (noEligiblePages) {
      results.push({ key: 'repetitive_content', label: DIMENSION_LABELS.repetitive_content, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else if (eligiblePageCount < MIN_PAGES_FOR_REPETITION_PATTERN) {
      results.push({
        key: 'repetitive_content',
        label: DIMENSION_LABELS.repetitive_content,
        status: 'limited_confidence',
        summary: `Only ${eligiblePageCount} eligible page${eligiblePageCount === 1 ? '' : 's'} analyzed — too few to reliably detect cross-page boilerplate patterns.`,
        relatedCheckKeys: [],
      })
    } else if (finding) {
      results.push({ key: 'repetitive_content', label: DIMENSION_LABELS.repetitive_content, status: 'findings', summary: 'Some pages consist mostly of repeated template content.', relatedCheckKeys: ['highly_repetitive_page'] })
    } else {
      results.push({ key: 'repetitive_content', label: DIMENSION_LABELS.repetitive_content, status: 'healthy', summary: 'No pages were found to be dominated by repeated template content.', relatedCheckKeys: [] })
    }
  }

  // 6. Content Structure <- weak_content_structure
  //
  // MINIMUM EVIDENCE RULE: this check only ever evaluates pages with
  // enough substantive content to meaningfully judge (>= 150 words) — a
  // short page correctly needs no headings at all. If NO eligible page
  // cleared that floor, nothing was actually checked, so the honest result
  // is 'not_assessed', never a "Good" earned merely by having nothing to
  // evaluate.
  {
    const finding = findByCheckKey(findings, 'weak_content_structure')
    if (noEligiblePages) {
      results.push({ key: 'content_structure', label: DIMENSION_LABELS.content_structure, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else if (finding) {
      results.push({ key: 'content_structure', label: DIMENSION_LABELS.content_structure, status: 'findings', summary: 'Some pages present substantial content with little paragraph/heading organization.', relatedCheckKeys: ['weak_content_structure'] })
    } else if (noSubstantivePages) {
      results.push({
        key: 'content_structure',
        label: DIMENSION_LABELS.content_structure,
        status: 'not_assessed',
        summary: 'No pages had enough substantive content to meaningfully evaluate paragraph/heading organization.',
        relatedCheckKeys: [],
      })
    } else {
      results.push({
        key: 'content_structure',
        label: DIMENSION_LABELS.content_structure,
        status: 'healthy',
        summary: 'No pages were found with poor paragraph/heading organization relative to their length. This checks paragraph and heading counts only — not writing quality or heading hierarchy.',
        relatedCheckKeys: [],
      })
    }
  }

  // 7. Page Purpose <- page_purpose_summary (always informational; status reflects classifier coverage, never a "problem")
  {
    const finding = findByCheckKey(findings, 'page_purpose_summary')
    if (!finding) {
      results.push({ key: 'page_purpose', label: DIMENSION_LABELS.page_purpose, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else {
      const evidence = finding.evidence ?? {}
      const unknownCount = typeof evidence.unknownCount === 'number' ? evidence.unknownCount : 0
      const isWellClassified = eligiblePageCount > 0 && unknownCount / eligiblePageCount < 0.5
      results.push({
        key: 'page_purpose',
        label: DIMENSION_LABELS.page_purpose,
        status: isWellClassified ? 'healthy' : 'limited_confidence',
        summary: isWellClassified
          ? 'Analyzed — most pages were confidently classified by purpose, used to set reasonable expectations for other dimensions.'
          : 'Analyzed, with limited classifier coverage — most pages could not be confidently classified beyond "unknown" (a deliberately conservative, narrow classifier).',
        relatedCheckKeys: ['page_purpose_summary'],
      })
    }
  }

  // 8. FAQ / Question Coverage <- faq_opportunity (opportunity-only, never a problem)
  //
  // MINIMUM EVIDENCE RULE: only substantive (>= 150-word) pages are ever
  // considered — if none exist, nothing was checked, so 'not_assessed' is
  // the honest result rather than a "Good" earned by having nothing to
  // evaluate.
  {
    const finding = findByCheckKey(findings, 'faq_opportunity')
    if (noEligiblePages) {
      results.push({ key: 'faq_coverage', label: DIMENSION_LABELS.faq_coverage, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else if (finding) {
      results.push({ key: 'faq_coverage', label: DIMENSION_LABELS.faq_coverage, status: 'opportunities', summary: 'Some substantive pages could add a questions/FAQ section.', relatedCheckKeys: ['faq_opportunity'] })
    } else if (noSubstantivePages) {
      results.push({
        key: 'faq_coverage',
        label: DIMENSION_LABELS.faq_coverage,
        status: 'not_assessed',
        summary: 'No pages had enough substantive content for a question/FAQ opportunity to be meaningfully evaluated.',
        relatedCheckKeys: [],
      })
    } else {
      results.push({
        key: 'faq_coverage',
        label: DIMENSION_LABELS.faq_coverage,
        status: 'healthy',
        summary: 'No FAQ opportunities were flagged for analyzed pages — this reflects heading-level evidence only, not a review of every page\'s prose.',
        relatedCheckKeys: [],
      })
    }
  }

  // 9. Topical Coverage — never assessed (would require keyword/semantic evidence this phase explicitly does not invent).
  results.push({
    key: 'topical_coverage',
    label: DIMENSION_LABELS.topical_coverage,
    status: 'not_assessed',
    summary: 'Not enough reliable evidence to assess this yet — identifying which subtopics a page covers or omits requires semantic interpretation this analyzer version does not perform by default.',
    relatedCheckKeys: [],
  })

  // 10. Content Differentiation <- DERIVED from exact_duplicate_content + highly_repetitive_page (never a new deduction — purely a cross-referencing summary)
  {
    const duplicateFinding = findByCheckKey(findings, 'exact_duplicate_content')
    const repetitiveFinding = findByCheckKey(findings, 'highly_repetitive_page')
    if (noEligiblePages) {
      results.push({ key: 'content_differentiation', label: DIMENSION_LABELS.content_differentiation, status: 'not_assessed', summary: 'No eligible pages were analyzed.', relatedCheckKeys: [] })
    } else if (duplicateFinding || repetitiveFinding) {
      const related = [duplicateFinding && 'exact_duplicate_content', repetitiveFinding && 'highly_repetitive_page'].filter((v): v is string => !!v)
      results.push({
        key: 'content_differentiation',
        label: DIMENSION_LABELS.content_differentiation,
        status: 'findings',
        summary: 'Some pages overlap with others in substantive content (see Duplicate/Repetitive Content) — a strong signal against differentiation.',
        relatedCheckKeys: related,
      })
    } else {
      results.push({
        key: 'content_differentiation',
        label: DIMENSION_LABELS.content_differentiation,
        status: 'limited_confidence',
        summary: 'No exact or repetitive content overlap was found, but broader topical differentiation (beyond overlap detection) requires semantic interpretation this analyzer version does not perform.',
        relatedCheckKeys: [],
      })
    }
  }

  // 11. Content Freshness — never assessed; no reliable date evidence is persisted.
  results.push({
    key: 'content_freshness',
    label: DIMENSION_LABELS.content_freshness,
    status: 'not_assessed',
    summary: 'Not enough reliable evidence to assess this yet — no publish/modified date evidence (structured data, HTTP headers, or visible dates) is currently captured. A copyright-footer year is not used as evidence of page freshness.',
    relatedCheckKeys: [],
  })

  // 12. Content Opportunities — rollup of every opportunity-kind finding across all other dimensions.
  {
    const opportunityFindings = findings.filter((f) => f.kind === 'opportunity' && f.checkKey !== 'page_purpose_summary')
    if (opportunityFindings.length > 0) {
      results.push({
        key: 'content_opportunities',
        label: DIMENSION_LABELS.content_opportunities,
        status: 'opportunities',
        summary: `${opportunityFindings.length} opportunity type${opportunityFindings.length === 1 ? '' : 's'} identified across analyzed pages — none of these reduce Content Health.`,
        relatedCheckKeys: opportunityFindings.map((f) => f.checkKey),
      })
    } else {
      results.push({ key: 'content_opportunities', label: DIMENSION_LABELS.content_opportunities, status: 'healthy', summary: 'No specific opportunities were identified this analysis.', relatedCheckKeys: [] })
    }
  }

  return results
}
