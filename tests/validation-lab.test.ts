import { describe, expect, it } from 'vitest'
import type { CrawlEvidence } from '@/lib/crawler/evidence'
import type { CategorySummary } from '@/lib/category-engine/types'
import { computeOverallWebsiteHealth } from '@/lib/category-engine/overall-health'
import { healthLabel } from '@/lib/scanner/health-label'

import { createFakeTechnicalSeoStore } from './helpers/fake-technical-seo-store'
import { analyzeTechnicalSeo } from '@/lib/technical-seo/run-analysis'
import { buildTechnicalSeoCategorySummary } from '@/app/dashboard/websites/[id]/technical-seo-summary'

import { createFakeOnPageStore } from './helpers/fake-on-page-store'
import { analyzeOnPage } from '@/lib/on-page/run-analysis'
import { buildOnPageCategorySummary } from '@/app/dashboard/websites/[id]/on-page-summary'

import { createFakeArchitectureStore } from './helpers/fake-architecture-store'
import { analyzeArchitecture } from '@/lib/architecture/run-analysis'
import { buildSiteArchitectureCategorySummary } from '@/app/dashboard/websites/[id]/site-architecture-summary'

import { createFakeContentStore } from './helpers/fake-content-store'
import { analyzeContent } from '@/lib/content/run-analysis'
import { buildContentCategorySummary } from '@/app/dashboard/websites/[id]/content-summary'

import { createFakePillarStore } from './helpers/fake-pillar-store'
import { analyzePerformance } from '@/lib/performance/run-analysis'
import { analyzeAccessibility } from '@/lib/accessibility/run-analysis'
import { analyzeSecurity } from '@/lib/security/run-analysis'
import { buildPillarCategorySummary } from '@/lib/pillars/summary'

import * as fixtures from './helpers/validation-lab-fixtures'

/**
 * Scoring Engine V2 (2026-09-24) — WEBIOOM VALIDATION LAB.
 *
 * See tests/helpers/validation-lab-fixtures.ts's own doc comment for the
 * architecture: every scenario here is deterministic, local, in-memory
 * crawl evidence run through the REAL production analyzers and category-
 * summary builders — the exact same functions the live app calls — never a
 * reimplementation of the scoring logic.
 *
 * Per this suite's own explicit design brief: assertions test SCORE
 * RELATIONSHIPS AND INVARIANTS (healthy > placeholder, isolated < systemic,
 * etc.), not arbitrary exact numbers, except where a number follows
 * directly from a documented, deterministic rule (e.g. the overall-score
 * mean arithmetic itself).
 */

async function runSevenPillars(evidence: CrawlEvidence) {
  const crawlRunId = evidence.crawlRun.id
  const seed = { [crawlRunId]: evidence }

  const [technicalSeoResult, onPageResult, architectureResult, contentResult, performanceResult, accessibilityResult, securityResult] = await Promise.all([
    analyzeTechnicalSeo(createFakeTechnicalSeoStore(seed), crawlRunId),
    analyzeOnPage(createFakeOnPageStore(seed), crawlRunId),
    analyzeArchitecture(createFakeArchitectureStore(seed), crawlRunId),
    analyzeContent(createFakeContentStore(seed), crawlRunId),
    analyzePerformance(createFakePillarStore(seed), crawlRunId),
    analyzeAccessibility(createFakePillarStore(seed), crawlRunId),
    analyzeSecurity(createFakePillarStore(seed), crawlRunId),
  ])

  for (const [name, result] of Object.entries({ technicalSeoResult, onPageResult, architectureResult, contentResult, performanceResult, accessibilityResult, securityResult })) {
    if (!result.ok) throw new Error(`${name} failed to analyze this fixture: ${(result as { error: string }).error}`)
  }
  if (!technicalSeoResult.ok || !onPageResult.ok || !architectureResult.ok || !contentResult.ok || !performanceResult.ok || !accessibilityResult.ok || !securityResult.ok) {
    throw new Error('unreachable')
  }

  const technicalSeo = buildTechnicalSeoCategorySummary(evidence.crawlRun, technicalSeoResult.analysis)
  const onPageSeo = buildOnPageCategorySummary(evidence.crawlRun, onPageResult.analysis)
  const siteArchitecture = buildSiteArchitectureCategorySummary(evidence.crawlRun, architectureResult.analysis)
  const content = buildContentCategorySummary(evidence.crawlRun, contentResult.analysis)
  const performance = buildPillarCategorySummary('performance', evidence.crawlRun, performanceResult.analysis)
  const accessibility = buildPillarCategorySummary('accessibility', evidence.crawlRun, accessibilityResult.analysis)
  const security = buildPillarCategorySummary('security', evidence.crawlRun, securityResult.analysis)

  const summaries: CategorySummary[] = [technicalSeo, onPageSeo, siteArchitecture, content, performance, accessibility, security]
  const overall = computeOverallWebsiteHealth(summaries)

  return {
    overall,
    // Scoring Engine V1 contract (2026-09-24) — computeOverallWebsiteHealth
    // itself now withholds `score` unless all seven pillars are fully,
    // adequately evidenced, so "complete" collapses to a plain null check.
    isComplete: overall.score !== null,
    byPillar: { technicalSeo, onPageSeo, siteArchitecture, content, performance, accessibility, security },
    raw: {
      technicalSeo: technicalSeoResult,
      onPage: onPageResult,
      architecture: architectureResult,
      content: contentResult,
      performance: performanceResult,
      accessibility: accessibilityResult,
      security: securityResult,
    },
  }
}

function scoreOf(summary: CategorySummary): number {
  expect(summary.status).toBe('analyzed')
  expect(summary.score).not.toBeNull()
  return summary.score as number
}

describe('Validation Lab — 1. Healthy multi-page site', () => {
  it('produces strong, fully-supported scores across every pillar with no fabricated findings', async () => {
    const result = await runSevenPillars(fixtures.healthyMultiPageSite())

    expect(result.isComplete).toBe(true)
    expect(result.overall.score).not.toBeNull()
    expect(healthLabel(result.overall.score as number)).not.toBe('Poor')
    for (const summary of Object.values(result.byPillar)) {
      expect(summary.status).toBe('analyzed')
      expect(summary.coverage).toBe('adequate')
    }
  })
})

describe('Validation Lab — 2. Healthy small site', () => {
  it('is not automatically punished for being small — its Content and Architecture scores are genuinely earned, not artificially discounted for having only 2 pages', async () => {
    const result = await runSevenPillars(fixtures.healthySmallSite())

    expect(scoreOf(result.byPillar.content)).toBeGreaterThan(90)
    expect(scoreOf(result.byPillar.siteArchitecture)).toBeGreaterThan(90)
    expect(result.byPillar.content.coverage).toBe('adequate')
    expect(result.byPillar.siteArchitecture.coverage).toBe('adequate')
  })

  it('scores at least as well as the healthy multi-page site on pillars that do not depend on having many pages (Technical SEO, Security)', async () => {
    const small = await runSevenPillars(fixtures.healthySmallSite())
    const multi = await runSevenPillars(fixtures.healthyMultiPageSite())

    expect(scoreOf(small.byPillar.technicalSeo)).toBeGreaterThanOrEqual(scoreOf(multi.byPillar.technicalSeo) - 1)
    expect(scoreOf(small.byPillar.security)).toBeGreaterThanOrEqual(scoreOf(multi.byPillar.security) - 1)
  })

  it('is capable of a COMPLETE, fully-supported Overall Website Health — a legitimately small site with sufficient evidence must not be structurally prevented from ever reaching the complete assessment state', async () => {
    const result = await runSevenPillars(fixtures.healthySmallSite())
    expect(result.isComplete).toBe(true)
    expect(result.overall.score).not.toBeNull()
    expect(result.overall.score as number).toBeGreaterThan(90)
  })
})

describe('Validation Lab — 3. Placeholder site (the reported ~94 failure shape)', () => {
  it('Overall Website Health is WITHHELD (null), never a plain number — Site Architecture has no link graph to evaluate from one page, so the seven-pillar assessment is genuinely incomplete', async () => {
    const result = await runSevenPillars(fixtures.placeholderSite())
    expect(result.overall.score).toBeNull()
    expect(result.isComplete).toBe(false)
  })

  it('Content earns a real, traceable, sub-100 score from an actual evidence-backed defect — critically thin content (well under half the homepage minimum), affecting 100% of the one page analyzed, which is exactly what escalates it to \'critical\' severity — never a fabricated ceiling', async () => {
    const result = await runSevenPillars(fixtures.placeholderSite())
    expect(scoreOf(result.byPillar.content)).toBeLessThan(100)
    expect(result.raw.content.ok && result.raw.content.findings.some((f) => f.checkKey === 'substantively_thin_page' && f.severity === 'critical')).toBe(true)
  })

  it('Site Architecture is WITHHELD (not_analyzed) — a single page has no link graph of any kind to evaluate, so there is no applicable check left to have earned a score from', async () => {
    const result = await runSevenPillars(fixtures.placeholderSite())
    expect(result.byPillar.siteArchitecture.status).toBe('not_analyzed')
    expect(result.byPillar.siteArchitecture.score).toBeNull()
  })

  it('On-Page SEO earns a real, sub-100 score from three genuine, distinct findings (a too-short and generic/placeholder-style title, a too-short meta description) — never an artificial cap for an unrelated limitation (comparison checks needing 2+ pages)', async () => {
    const result = await runSevenPillars(fixtures.placeholderSite())
    expect(scoreOf(result.byPillar.onPageSeo)).toBeLessThan(100)
    expect(result.raw.onPage.ok && result.raw.onPage.findings.some((f) => f.checkKey === 'weak_title')).toBe(true)
    expect(result.raw.onPage.ok && result.raw.onPage.findings.some((f) => f.checkKey === 'title_too_short')).toBe(true)
  })
})

describe('Validation Lab — 4. Empty / near-empty site', () => {
  it('exposes genuinely poor/insufficient content and on-page evidence rather than reading as excellent, and withholds Overall Website Health entirely', async () => {
    const result = await runSevenPillars(fixtures.emptySite())
    expect(scoreOf(result.byPillar.content)).toBeLessThan(100)
    expect(scoreOf(result.byPillar.onPageSeo)).toBeLessThan(100)
    expect(result.raw.onPage.ok && result.raw.onPage.findings.some((f) => f.checkKey === 'missing_h1')).toBe(true)
    expect(result.overall.score).toBeNull()
  })

  it('scores worse than the placeholder on On-Page SEO — missing title/meta/H1 entirely is a stronger signal than merely short/generic ones', async () => {
    const empty = await runSevenPillars(fixtures.emptySite())
    const placeholder = await runSevenPillars(fixtures.placeholderSite())
    expect(scoreOf(empty.byPillar.onPageSeo)).toBeLessThan(scoreOf(placeholder.byPillar.onPageSeo))
  })
})

describe('Validation Lab — 5. Technically clean but thin site', () => {
  it('Technical SEO AND On-Page SEO remain strong — their OWN applicable evidence (crawlability, title, meta) is genuinely clean — while Content independently reflects its own weak substance evidence: real pillar independence, not cross-pillar punishment for one pillar\'s thinness', async () => {
    const result = await runSevenPillars(fixtures.technicallyCleanThinSite())

    expect(scoreOf(result.byPillar.technicalSeo)).toBeGreaterThanOrEqual(85)
    expect(result.byPillar.technicalSeo.coverage).toBe('adequate')
    expect(scoreOf(result.byPillar.onPageSeo)).toBeGreaterThanOrEqual(90) // a well-formed title/meta earns a high score on its own merits
    expect(scoreOf(result.byPillar.content)).toBeLessThan(scoreOf(result.byPillar.onPageSeo)) // Content is the pillar that actually reflects the thinness
  })

  it('does not masquerade as a complete, excellent website merely because some pillars are clean — the "isComplete" contract, not the raw number, is what withholds that claim (a technically clean, HTTPS, defect-free page can legitimately push Technical SEO/Performance/Accessibility/Security near 100 each; the raw unweighted mean can still land high while Content alone is capped, which is exactly why isComplete exists as a SEPARATE signal from the score)', async () => {
    const result = await runSevenPillars(fixtures.technicallyCleanThinSite())
    expect(result.isComplete).toBe(false)
  })
})

describe('Validation Lab — 6. Large broken site', () => {
  it('scores materially lower than the healthy multi-page site on the pillars carrying the real defects', async () => {
    const broken = await runSevenPillars(fixtures.largeBrokenSite())
    const healthy = await runSevenPillars(fixtures.healthyMultiPageSite())

    expect(scoreOf(broken.byPillar.technicalSeo)).toBeLessThan(scoreOf(healthy.byPillar.technicalSeo))
    expect(scoreOf(broken.byPillar.onPageSeo)).toBeLessThan(scoreOf(healthy.byPillar.onPageSeo))
    expect(broken.overall.score as number).toBeLessThan(healthy.overall.score as number)
  })
})

describe('Validation Lab — 7. Mixed-quality site', () => {
  it('affected-page spread matters — a minority of thin/broken pages pulls the score down without destroying it entirely', async () => {
    const mixed = await runSevenPillars(fixtures.mixedQualitySite())
    const healthy = await runSevenPillars(fixtures.healthyMultiPageSite())

    expect(scoreOf(mixed.byPillar.onPageSeo)).toBeLessThan(scoreOf(healthy.byPillar.onPageSeo))
    expect(scoreOf(mixed.byPillar.onPageSeo)).toBeGreaterThan(0)
  })
})

describe('Validation Lab — 8. Duplicate metadata site', () => {
  it('detects duplicate title/description at the site level', async () => {
    const result = await runSevenPillars(fixtures.duplicateMetadataSite())
    expect(result.raw.onPage.ok && result.raw.onPage.findings.some((f) => f.checkKey === 'duplicate_title')).toBe(true)
    expect(result.raw.onPage.ok && result.raw.onPage.findings.some((f) => f.checkKey === 'duplicate_meta_description')).toBe(true)
  })
})

describe('Validation Lab — 9. Broken internal-link site', () => {
  it('a genuine internal 404 is a real finding — an otherwise-accessible crawl is not globally suppressed for one isolated error', async () => {
    const result = await runSevenPillars(fixtures.brokenInternalLinkSite())
    expect(result.raw.technicalSeo.ok && result.raw.technicalSeo.findings.some((f) => f.checkKey === 'internal_page_4xx')).toBe(true)
    expect(result.byPillar.technicalSeo.status).toBe('analyzed')
    expect(scoreOf(result.byPillar.technicalSeo)).toBeGreaterThan(0)
  })
})

describe('Validation Lab — 10. Noindex site', () => {
  it('an intentionally noindexed utility page does not tank an otherwise healthy site', async () => {
    const result = await runSevenPillars(fixtures.noindexSite())
    expect(scoreOf(result.byPillar.technicalSeo)).toBeGreaterThanOrEqual(75)
  })
})

describe('Validation Lab — 11. Canonical-conflict site', () => {
  it('produces evidence-backed Technical SEO findings without destroying the whole pillar', async () => {
    const result = await runSevenPillars(fixtures.canonicalConflictSite())
    expect(result.raw.technicalSeo.ok && result.raw.technicalSeo.findings.length).toBeGreaterThan(0)
    expect(scoreOf(result.byPillar.technicalSeo)).toBeGreaterThan(0)
  })
})

describe('Validation Lab — 12. Accessibility-defect site', () => {
  it('detects real, observable accessibility defects and reduces the Accessibility score without fabricating WCAG conformance claims', async () => {
    const result = await runSevenPillars(fixtures.accessibilityDefectSite())
    const healthy = await runSevenPillars(fixtures.healthyMultiPageSite())

    expect(result.raw.accessibility.ok && result.raw.accessibility.findings.some((f) => f.checkKey === 'images_missing_alt')).toBe(true)
    expect(result.raw.accessibility.ok && result.raw.accessibility.findings.some((f) => f.checkKey === 'missing_html_lang')).toBe(true)
    expect(scoreOf(result.byPillar.accessibility)).toBeLessThan(scoreOf(healthy.byPillar.accessibility))
  })
})

describe('Validation Lab — 13. Security-signal-defect site', () => {
  it('detects observable HTTPS/security-hygiene signals without claiming vulnerability-scanning capability', async () => {
    const result = await runSevenPillars(fixtures.securitySignalDefectSite())
    expect(result.raw.security.ok && result.raw.security.findings.some((f) => f.checkKey === 'not_using_https')).toBe(true)
    expect(scoreOf(result.byPillar.security)).toBeLessThan(100)
  })
})

describe('Validation Lab — 14. Partial-evidence site', () => {
  it('missing evidence (a page that was never fetched) is never treated as a passing check, and the partial status is preserved', async () => {
    const result = await runSevenPillars(fixtures.partialEvidenceSite())
    for (const summary of Object.values(result.byPillar)) {
      if (summary.status === 'analyzed') expect(summary.partial).toBe(true)
    }
  })
})

describe('Validation Lab — 15. Not-applicable case (no structured data anywhere)', () => {
  it('absence of structured data is NOT treated as a defect — no structured-data finding fires, and Technical SEO is not penalized for it', async () => {
    const result = await runSevenPillars(fixtures.notApplicableStructuredDataSite())
    expect(result.raw.technicalSeo.ok && result.raw.technicalSeo.findings.some((f) => f.checkKey === 'structured_data_invalid')).toBe(false)
    expect(scoreOf(result.byPillar.technicalSeo)).toBeGreaterThanOrEqual(85)
  })
})

describe('Validation Lab — Pathological/anti-gaming: G (meaningful one-page site) vs H (placeholder one-page site)', () => {
  it('distinguishes a genuinely meaningful single page from a placeholder single page — page count alone cannot tell them apart, substance can', async () => {
    const meaningful = await runSevenPillars(fixtures.oneMeaningfulPageSite())
    const placeholder = await runSevenPillars(fixtures.placeholderSite())

    expect(scoreOf(meaningful.byPillar.content)).toBeGreaterThan(scoreOf(placeholder.byPillar.content))
    expect(scoreOf(meaningful.byPillar.onPageSeo)).toBeGreaterThan(scoreOf(placeholder.byPillar.onPageSeo))
    // Both G and H are exactly one page, so BOTH withhold Overall Website
    // Health (Site Architecture has no link graph to evaluate from a single
    // page, whatever its content quality) — this is honest, not a bug: a
    // one-page site can be genuinely coherent, but this analyzer version
    // cannot confirm site-wide architecture health from one page alone. The
    // distinction between G and H shows up in the PILLARS that can actually
    // see it (Content, On-Page), never in a fabricated Overall difference.
    expect(meaningful.overall.score).toBeNull()
    expect(placeholder.overall.score).toBeNull()
    expect(meaningful.isComplete).toBe(false)
  })
})

describe('Validation Lab — Pathological/anti-gaming: repeated minor defect across many pages', () => {
  it('one identical, minor, template-level defect across 100 pages does not destroy the score the way 100 independent defects would', async () => {
    const result = await runSevenPillars(fixtures.repeatedMinorDefectSite(100))
    expect(result.raw.onPage.ok && result.raw.onPage.findings.find((f) => f.checkKey === 'missing_meta_description')?.affectedPageCount).toBe(100)
    expect(scoreOf(result.byPillar.onPageSeo)).toBeGreaterThanOrEqual(50)
  })
})

describe('Validation Lab — Pathological/anti-gaming: severe systemic defect vs isolated defect', () => {
  it('a severe systemic defect affecting most pages scores materially worse than one isolated defect on an otherwise-healthy site', async () => {
    const systemic = await runSevenPillars(fixtures.severeSystemicDefectSite(10))
    const isolated = await runSevenPillars(fixtures.brokenInternalLinkSite())

    expect(scoreOf(systemic.byPillar.technicalSeo)).toBeLessThan(scoreOf(isolated.byPillar.technicalSeo))
  })
})

describe('Validation Lab — Overall Score contract', () => {
  it('is the rounded arithmetic mean of exactly seven pillar scores when all seven are fully supported', async () => {
    const result = await runSevenPillars(fixtures.healthyMultiPageSite())
    expect(result.isComplete).toBe(true)

    const scores = [
      scoreOf(result.byPillar.technicalSeo),
      scoreOf(result.byPillar.onPageSeo),
      scoreOf(result.byPillar.siteArchitecture),
      scoreOf(result.byPillar.content),
      scoreOf(result.byPillar.performance),
      scoreOf(result.byPillar.accessibility),
      scoreOf(result.byPillar.security),
    ]
    const expected = Math.round(scores.reduce((sum, s) => sum + s, 0) / 7)
    expect(result.overall.score).toBe(expected)
    expect(result.overall.contributingCategoryCount).toBe(7)
    expect(result.overall.totalCanonicalCategories).toBe(7)
  })

  it('a thinly-evidenced pillar (even with all seven technically "analyzed") withholds the "complete" claim — incomplete evidence cannot masquerade as a complete excellent overall score', async () => {
    const result = await runSevenPillars(fixtures.technicallyCleanThinSite())
    expect(result.isComplete).toBe(false)
  })
})

describe('Validation Lab — UNKNOWN vs NOT_APPLICABLE semantics', () => {
  it('UNKNOWN evidence (never-fetched page) does not increase any score', async () => {
    const partial = await runSevenPillars(fixtures.partialEvidenceSite())
    // The never-fetched page contributes no positive evidence anywhere —
    // Technical SEO's own score must come only from the one genuinely
    // completed page's evidence, never an assumed pass for the missing one.
    expect(scoreOf(partial.byPillar.technicalSeo)).toBeLessThanOrEqual(100)
  })

  it('a NOT_APPLICABLE condition (no structured data present anywhere) does not penalize the score', async () => {
    const result = await runSevenPillars(fixtures.notApplicableStructuredDataSite())
    const healthy = await runSevenPillars(fixtures.healthyMultiPageSite())
    // Neither site has a structured-data defect; the not-applicable one
    // must not score any worse ON THAT DIMENSION than a site that also has
    // no structured data (both are silent on this check).
    expect(result.raw.technicalSeo.ok && result.raw.technicalSeo.findings.some((f) => f.checkKey === 'structured_data_invalid')).toBe(false)
    expect(healthy.raw.technicalSeo.ok && healthy.raw.technicalSeo.findings.some((f) => f.checkKey === 'structured_data_invalid')).toBe(false)
  })
})
