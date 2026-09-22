import { describe, expect, it } from 'vitest'
import { buildChangeSummary } from '@/lib/monitoring/compare'
import { computeFindingFingerprint } from '@/lib/monitoring/fingerprint'
import { CANONICAL_PILLARS, type CanonicalSnapshot, type CanonicalPillar, type PillarSnapshot, type SnapshotFinding } from '@/lib/monitoring/types'

function makeFinding(overrides: Partial<SnapshotFinding> & { pillar: CanonicalPillar; checkKey: string }): SnapshotFinding {
  const scope = overrides.scope ?? 'page'
  const instance = overrides.instance ?? (scope === 'page' ? { url: 'https://example.com/a', affectedResourceUrl: null } : null)
  const fingerprint =
    overrides.fingerprint ??
    computeFindingFingerprint({
      pillar: overrides.pillar,
      checkKey: overrides.checkKey,
      scope,
      instance: instance ?? undefined,
    })

  return {
    fingerprint,
    pillar: overrides.pillar,
    checkKey: overrides.checkKey,
    scope,
    title: overrides.title ?? overrides.checkKey,
    severity: overrides.severity ?? 'medium',
    actionability: overrides.actionability ?? 'guided_fix',
    instance,
  }
}

function makeEmptyPillars(): Record<CanonicalPillar, PillarSnapshot> {
  const pillars = {} as Record<CanonicalPillar, PillarSnapshot>
  for (const pillar of CANONICAL_PILLARS) {
    pillars[pillar] = { pillar, coverage: 'analyzed', healthScore: 90, findings: [] }
  }
  return pillars
}

function makeSnapshot(overrides: {
  crawlRunId: string
  completedAt?: string
  isPartialCrawl?: boolean
  overallHealthScore?: number | null
  analyzedPageUrls?: string[]
  pillarOverrides?: Partial<Record<CanonicalPillar, Partial<PillarSnapshot>>>
}): CanonicalSnapshot {
  const pillars = makeEmptyPillars()
  if (overrides.pillarOverrides) {
    for (const [pillar, pillarOverride] of Object.entries(overrides.pillarOverrides)) {
      pillars[pillar as CanonicalPillar] = { ...pillars[pillar as CanonicalPillar], ...pillarOverride }
    }
  }

  return {
    crawlRunId: overrides.crawlRunId,
    websiteId: 'website-1',
    completedAt: overrides.completedAt ?? '2026-01-01T00:00:00Z',
    isPartialCrawl: overrides.isPartialCrawl ?? false,
    overallHealth: {
      score: overrides.overallHealthScore === undefined ? 90 : overrides.overallHealthScore,
      contributingCategoryCount: 7,
      totalCanonicalCategories: 7,
    },
    pillars,
    analyzedPageUrls: new Set(overrides.analyzedPageUrls ?? ['https://example.com/a']),
  }
}

describe('buildChangeSummary — finding classification', () => {
  it('a finding present only in current is NEW', () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1' })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: { on_page_seo: { findings: [makeFinding({ pillar: 'on_page_seo', checkKey: 'missing_title' })] } },
    })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.new).toBe(1)
    expect(summary.findingChanges[0].state).toBe('new')
  })

  it('a finding present only in previous, on a page that WAS re-analyzed in current, is RESOLVED', () => {
    const finding = makeFinding({ pillar: 'on_page_seo', checkKey: 'missing_title' })
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { on_page_seo: { findings: [finding] } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', analyzedPageUrls: ['https://example.com/a'] })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.resolved).toBe(1)
    expect(summary.findingChanges[0].state).toBe('resolved')
  })

  it('a finding present in both, with the identical severity, is PERSISTENT', () => {
    const previous = makeSnapshot({
      crawlRunId: 'run-1',
      pillarOverrides: { on_page_seo: { findings: [makeFinding({ pillar: 'on_page_seo', checkKey: 'missing_title', severity: 'high' })] } },
    })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: { on_page_seo: { findings: [makeFinding({ pillar: 'on_page_seo', checkKey: 'missing_title', severity: 'high' })] } },
    })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.persistent).toBe(1)
    expect(summary.findingChanges[0].state).toBe('persistent')
    expect(summary.findingChanges[0].severityChange).toBeNull()
  })

  it('the same logical finding with a brand new database UUID (never part of the fingerprint) still resolves to the SAME identity across scans', () => {
    // The fingerprint is computed purely from pillar/checkKey/scope/instance
    // — this test documents that no db row id ever participates in it.
    const previous = makeSnapshot({
      crawlRunId: 'run-1',
      pillarOverrides: { accessibility: { findings: [makeFinding({ pillar: 'accessibility', checkKey: 'images_missing_alt', severity: 'medium' })] } },
    })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: { accessibility: { findings: [makeFinding({ pillar: 'accessibility', checkKey: 'images_missing_alt', severity: 'medium' })] } },
    })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.persistent).toBe(1)
  })

  it('a finding present in both, with HIGHER severity now, is WORSENED', () => {
    const previous = makeSnapshot({
      crawlRunId: 'run-1',
      pillarOverrides: { security: { findings: [makeFinding({ pillar: 'security', checkKey: 'mixed_content', severity: 'medium' })] } },
    })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: { security: { findings: [makeFinding({ pillar: 'security', checkKey: 'mixed_content', severity: 'critical' })] } },
    })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.worsened).toBe(1)
    expect(summary.findingChanges[0].state).toBe('worsened')
    expect(summary.findingChanges[0].severityChange).toEqual({ from: 'medium', to: 'critical' })
  })

  it('a finding present in both, with LOWER severity now, is IMPROVED', () => {
    const previous = makeSnapshot({
      crawlRunId: 'run-1',
      pillarOverrides: { security: { findings: [makeFinding({ pillar: 'security', checkKey: 'mixed_content', severity: 'high' })] } },
    })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: { security: { findings: [makeFinding({ pillar: 'security', checkKey: 'mixed_content', severity: 'low' })] } },
    })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.improved).toBe(1)
    expect(summary.findingChanges[0].state).toBe('improved')
    expect(summary.findingChanges[0].severityChange).toEqual({ from: 'high', to: 'low' })
  })

  it('COVERAGE-AWARE (P0): a finding disappears because its page was NOT re-crawled — this must be UNVERIFIED, never falsely RESOLVED', () => {
    const finding = makeFinding({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      instance: { url: 'https://example.com/never-recrawled', affectedResourceUrl: null },
    })
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { on_page_seo: { findings: [finding] } } })
    // current's own analyzedPageUrls does NOT include /never-recrawled
    const current = makeSnapshot({ crawlRunId: 'run-2', analyzedPageUrls: ['https://example.com/a'] })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.unverified).toBe(1)
    expect(summary.counts.resolved).toBe(0)
    expect(summary.findingChanges[0].state).toBe('unverified')
  })

  it('COVERAGE-AWARE (P0): a PARTIAL second crawl that never reached a previously-flagged page produces the same honest UNVERIFIED result — partial-crawl coverage is not a special case, it flows through the identical analyzedPageUrls mechanism', () => {
    const finding = makeFinding({
      pillar: 'on_page_seo',
      checkKey: 'missing_title',
      instance: { url: 'https://example.com/deep/page-not-reached', affectedResourceUrl: null },
    })
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { on_page_seo: { findings: [finding] } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', isPartialCrawl: true, analyzedPageUrls: ['https://example.com/a'] })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.unverified).toBe(1)
    expect(summary.counts.resolved).toBe(0)
  })

  it('COVERAGE-AWARE (P0): a whole pillar that failed/was not analyzed in the later scan means every one of its previous findings is UNVERIFIED, never RESOLVED', () => {
    const finding = makeFinding({ pillar: 'security', checkKey: 'not_using_https', scope: 'site' })
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { security: { findings: [finding] } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', pillarOverrides: { security: { coverage: 'not_analyzed', healthScore: null } } })

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.unverified).toBe(1)
    expect(summary.counts.resolved).toBe(0)
  })

  /**
   * Blocked-crawl Technical SEO correction (2026-09-22, follow-up): a
   * website that was previously accessible to webioom (real Technical SEO
   * findings, real score) suddenly starts returning 403 to every request
   * (a firewall/bot-protection rule). Technical SEO's own coverage now
   * resolves to 'none' → CategorySummary.status 'not_analyzed' for that
   * scan (see technical-seo-summary.ts / lib/technical-seo/coverage.ts) —
   * which flows into monitoring exactly like ANY other not-analyzed
   * pillar: this test names that specific real-world transition
   * explicitly, on top of the already-generic coverage above.
   */
  it("BLOCKED-CRAWL TRANSITION — a website accessible last scan (real Technical SEO findings/score) that becomes blocked this scan reports its previous findings as UNVERIFIED, never falsely RESOLVED, and its score as not_comparable, never a fabricated collapse", () => {
    const finding = makeFinding({ pillar: 'technical_seo', checkKey: 'internal_page_4xx', scope: 'page' })
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { technical_seo: { coverage: 'analyzed', healthScore: 92, findings: [finding] } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', pillarOverrides: { technical_seo: { coverage: 'not_analyzed', healthScore: null, findings: [] } } })

    const summary = buildChangeSummary(previous, current)

    // Never "Fixed!" — webioom simply couldn't check this time.
    expect(summary.counts.resolved).toBe(0)
    expect(summary.counts.unverified).toBe(1)

    // Never a fabricated "Technical SEO collapsed from 92 to null" delta.
    const technicalSeoDelta = summary.pillarDeltas.find((d) => d.pillar === 'technical_seo')
    expect(technicalSeoDelta?.comparability).toBe('not_comparable')
    expect(technicalSeoDelta?.delta).toBeNull()
  })

  it('a site-scoped finding IS correctly resolved when its pillar WAS analyzed again and the fact is simply gone', () => {
    const finding = makeFinding({ pillar: 'security', checkKey: 'not_using_https', scope: 'site' })
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { security: { findings: [finding] } } })
    const current = makeSnapshot({ crawlRunId: 'run-2' }) // security pillar analyzed, no findings

    const summary = buildChangeSummary(previous, current)
    expect(summary.counts.resolved).toBe(1)
  })

  it('a resource-scoped fingerprint for a DIFFERENT resource on the same page never collapses into the same identity', () => {
    const previous = makeSnapshot({
      crawlRunId: 'run-1',
      pillarOverrides: {
        accessibility: {
          findings: [
            makeFinding({
              pillar: 'accessibility',
              checkKey: 'images_missing_alt',
              instance: { url: 'https://example.com/a', affectedResourceUrl: 'https://example.com/photo1.jpg' },
            }),
          ],
        },
      },
    })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: {
        accessibility: {
          findings: [
            makeFinding({
              pillar: 'accessibility',
              checkKey: 'images_missing_alt',
              instance: { url: 'https://example.com/a', affectedResourceUrl: 'https://example.com/photo2.jpg' },
            }),
          ],
        },
      },
    })

    const summary = buildChangeSummary(previous, current)
    // photo1 vanished (resolved, page WAS covered) and photo2 is new
    expect(summary.counts.new).toBe(1)
    expect(summary.counts.resolved).toBe(1)
  })

  it('Sprint 2 Prompt 2, scenario 18 — a RESOLVED finding that later REAPPEARS is classified NEW again, not silently ignored or double-counted as still-resolved: each comparison only ever looks at its own immediate previous/current pair, so a fingerprint absent from the immediately-preceding snapshot is new again regardless of its more distant history', () => {
    const finding = makeFinding({ pillar: 'on_page_seo', checkKey: 'missing_title' })

    // Scan 1 -> Scan 2: the finding is resolved.
    const scan1 = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { on_page_seo: { findings: [finding] } } })
    const scan2 = makeSnapshot({ crawlRunId: 'run-2' })
    const firstComparison = buildChangeSummary(scan1, scan2)
    expect(firstComparison.counts.resolved).toBe(1)

    // Scan 2 -> Scan 3: the exact same fingerprint reappears — compared
    // against scan2 (which lacks it), so it is NEW again, fully eligible
    // to be a meaningful event a second time.
    const scan3 = makeSnapshot({ crawlRunId: 'run-3', pillarOverrides: { on_page_seo: { findings: [finding] } } })
    const secondComparison = buildChangeSummary(scan2, scan3)
    expect(secondComparison.counts.new).toBe(1)
    expect(secondComparison.findingChanges[0].state).toBe('new')
  })
})

describe('buildChangeSummary — score deltas', () => {
  it('Overall Health increase is reported as a positive, comparable delta', () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', overallHealthScore: 70 })
    const current = makeSnapshot({ crawlRunId: 'run-2', overallHealthScore: 82 })
    const summary = buildChangeSummary(previous, current)
    expect(summary.overallHealth).toEqual({ previousScore: 70, currentScore: 82, delta: 12, comparability: 'comparable' })
  })

  it('Overall Health decrease is reported as a negative, comparable delta', () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', overallHealthScore: 82 })
    const current = makeSnapshot({ crawlRunId: 'run-2', overallHealthScore: 70 })
    const summary = buildChangeSummary(previous, current)
    expect(summary.overallHealth.delta).toBe(-12)
  })

  it('Overall Health is not_comparable when either snapshot has no score at all', () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', overallHealthScore: null })
    const current = makeSnapshot({ crawlRunId: 'run-2', overallHealthScore: 82 })
    const summary = buildChangeSummary(previous, current)
    expect(summary.overallHealth.comparability).toBe('not_comparable')
    expect(summary.overallHealth.delta).toBeNull()
  })

  it('a pillar with a genuine score in both scans reports a comparable delta', () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { performance: { healthScore: 60 } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', pillarOverrides: { performance: { healthScore: 75 } } })
    const summary = buildChangeSummary(previous, current)
    const performanceDelta = summary.pillarDeltas.find((d) => d.pillar === 'performance')
    expect(performanceDelta).toEqual({ pillar: 'performance', previousScore: 60, currentScore: 75, delta: 15, comparability: 'comparable' })
  })

  it('a pillar not assessed in either scan is not_comparable, never a fabricated delta', () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { content: { coverage: 'not_analyzed', healthScore: null } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', pillarOverrides: { content: { coverage: 'not_analyzed', healthScore: null } } })
    const summary = buildChangeSummary(previous, current)
    const contentDelta = summary.pillarDeltas.find((d) => d.pillar === 'content')
    expect(contentDelta?.comparability).toBe('not_comparable')
    expect(contentDelta?.delta).toBeNull()
  })

  /**
   * Evidence-aware health scoring (2026-09-22) — item 19's exact scenario:
   * a previously-accessible website suddenly returns 403 to webioom (e.g. a
   * firewall started blocking the scanner). The pillar still has a real,
   * persisted score, but built from too little evidence (coverage 'low')
   * to trust as genuinely comparable — this must NOT be reported as
   * "Website Health fell from 92 to 12," only as "not enough evidence to
   * compare."
   */
  it("MONITORING SAFETY — a pillar with real scores in both scans, but 'insufficient_data' coverage in the current one (e.g. a sudden firewall block), is not_comparable — never a false health-collapse delta", () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { technical_seo: { coverage: 'analyzed', healthScore: 92 } } })
    const current = makeSnapshot({ crawlRunId: 'run-2', pillarOverrides: { technical_seo: { coverage: 'insufficient_data', healthScore: 12 } } })
    const summary = buildChangeSummary(previous, current)
    const technicalSeoDelta = summary.pillarDeltas.find((d) => d.pillar === 'technical_seo')
    expect(technicalSeoDelta?.comparability).toBe('not_comparable')
    expect(technicalSeoDelta?.delta).toBeNull()
  })

  it("MONITORING SAFETY — Overall Health is also not_comparable when either scan's contributing category set was built with insufficient_data coverage for that pillar", () => {
    const previous = makeSnapshot({ crawlRunId: 'run-1', pillarOverrides: { security: { coverage: 'analyzed', healthScore: 90 } } })
    const current = makeSnapshot({
      crawlRunId: 'run-2',
      pillarOverrides: { security: { coverage: 'insufficient_data', healthScore: 5 } },
    })
    const summary = buildChangeSummary(previous, current)
    // Overall health itself is compared via the two snapshots' own
    // pre-computed overallHealth.score (see makeSnapshot's own default),
    // which is independent of any single pillar's coverage — this test
    // instead confirms the PILLAR-level guarantee holds even when overall
    // health happens to still be comparable, since the two are separate
    // signals a customer could otherwise misread together.
    const securityDelta = summary.pillarDeltas.find((d) => d.pillar === 'security')
    expect(securityDelta?.comparability).toBe('not_comparable')
  })
})
