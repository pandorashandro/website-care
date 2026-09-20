import { describe, expect, it } from 'vitest'
import { analyzeContent } from '@/lib/content/run-analysis'
import { createFakeContentStore } from './helpers/fake-content-store'
import { buildHealthyPages, makeThin, makeExactDuplicates, makeHighlyRepetitive, makeWeakStructure, toEvidence } from './helpers/content-synthetic-site'
import type { CrawlPageRow } from '@/lib/crawler/types'

const TIER_SITE_SIZE = 40

async function scoreFor(pages: CrawlPageRow[]): Promise<number> {
  const evidence = toEvidence(pages)
  const store = createFakeContentStore({ [evidence.crawlRun.id]: evidence })
  const result = await analyzeContent(store, evidence.crawlRun.id)
  if (!result.ok) throw new Error(result.error)
  return result.health.score
}

function buildExcellent(): CrawlPageRow[] {
  return buildHealthyPages(TIER_SITE_SIZE)
}

function buildGood(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeThin(pages, 2, 0)
  return pages
}

function buildModerate(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeThin(pages, 6, 0)
  makeWeakStructure(pages, 4, 6)
  return pages
}

function buildPoor(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeThin(pages, 8, 0)
  makeExactDuplicates(pages, 6, 8)
  makeHighlyRepetitive(pages, 6, 14)
  makeWeakStructure(pages, 4, 20)
  return pages
}

function buildSeverelyBroken(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeThin(pages, 15, 0)
  // Exactly at the 50% widespread-escalation breakpoint (shared
  // lib/category-engine/severity.ts rule) so this fixture genuinely
  // exercises the critical-severity path, not just "high".
  makeExactDuplicates(pages, 20, 15)
  makeHighlyRepetitive(pages, 5, 35)
  return pages
}

describe('Content Intelligence score calibration — controlled tiers (Excellent > Good > Moderate > Poor > Severely Broken)', () => {
  it('produces a strict descending order across all five tiers', async () => {
    const [excellent, good, moderate, poor, severe] = await Promise.all([
      scoreFor(buildExcellent()),
      scoreFor(buildGood()),
      scoreFor(buildModerate()),
      scoreFor(buildPoor()),
      scoreFor(buildSeverelyBroken()),
    ])

    expect(excellent).toBeGreaterThan(good)
    expect(good).toBeGreaterThan(moderate)
    expect(moderate).toBeGreaterThan(poor)
    expect(poor).toBeGreaterThan(severe)
  })

  it('Excellent scores a perfect 100', async () => {
    expect(await scoreFor(buildExcellent())).toBe(100)
  })

  it('Good stays high (minor, narrow-scope issues only)', async () => {
    expect(await scoreFor(buildGood())).toBeGreaterThanOrEqual(90)
  })

  it('Severely Broken scores meaningfully low and remains a bounded, explainable number', async () => {
    // NOT an arbitrary tight bound: with only 4 problem checks, none of
    // them critical-by-default (only exact_duplicate_content can reach
    // 'critical', via the shared >=50%-widespread escalation rule), the
    // mathematical ceiling on how low a single-check-per-dimension V1 model
    // can score is real and bounded — verified directly here rather than
    // asserted against an unfounded guess (mirrors the identical
    // "structural ceiling" conclusion Site Architecture's own Phase 27
    // score-calibration audit reached and documented).
    const score = await scoreFor(buildSeverelyBroken())
    expect(score).toBeLessThan(55)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('Poor scores meaningfully worse than Moderate but meaningfully better than Severely Broken', async () => {
    const [moderate, poor, severe] = await Promise.all([scoreFor(buildModerate()), scoreFor(buildPoor()), scoreFor(buildSeverelyBroken())])
    expect(poor).toBeLessThan(moderate)
    expect(poor).toBeGreaterThan(severe)
  })
})

describe('Content Intelligence mutation testing', () => {
  it('adding a real content problem never improves the score', async () => {
    const healthy = buildHealthyPages(TIER_SITE_SIZE)
    const withProblem = buildHealthyPages(TIER_SITE_SIZE)
    makeThin(withProblem, 1, 0)

    expect(await scoreFor(withProblem)).toBeLessThanOrEqual(await scoreFor(healthy))
  })

  it('fixing a content problem never reduces the score', async () => {
    const broken = buildPoor()
    const fixed = broken.map((page, i) => (i < 8 ? { ...page, content_word_count: 200 } : page))

    const brokenScore = await scoreFor(broken)
    const fixedScore = await scoreFor(fixed)
    expect(fixedScore).toBeGreaterThanOrEqual(brokenScore)
  })

  it('an optional opportunity (FAQ suggestion) never reduces the score, no matter how many pages it affects', async () => {
    // Every healthy page already HAS an FAQ heading (see buildHealthyPages),
    // so remove it from ALL pages to maximize the faq_opportunity finding's
    // reach, and confirm the score is untouched.
    const pages = buildHealthyPages(TIER_SITE_SIZE).map((page) => ({ ...page, content_heading_texts: [] }))
    expect(await scoreFor(pages)).toBe(100)
  })

  it('increasing affected-page prevalence of the same problem never improves the score', async () => {
    const narrow = buildHealthyPages(TIER_SITE_SIZE)
    makeThin(narrow, 2, 0)

    const wide = buildHealthyPages(TIER_SITE_SIZE)
    makeThin(wide, 20, 0)

    expect(await scoreFor(wide)).toBeLessThanOrEqual(await scoreFor(narrow))
  })

  it('a duplicate-content group spanning many pages does not create combinatorial (pairwise) score collapse', async () => {
    const pages = buildHealthyPages(TIER_SITE_SIZE)
    makeExactDuplicates(pages, 20, 0) // C(20,2) = 190 pairs if scored naively
    const score = await scoreFor(pages)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeGreaterThanOrEqual(40) // one high-severity finding, tier-capped
  })

  it('re-running analysis on identical evidence reproduces the identical score (no duplication from repeated evidence)', async () => {
    const pages = buildPoor()
    const evidence = toEvidence(pages)
    const store = createFakeContentStore({ [evidence.crawlRun.id]: evidence })

    const first = await analyzeContent(store, evidence.crawlRun.id)
    const second = await analyzeContent(store, evidence.crawlRun.id)
    if (!first.ok || !second.ok) throw new Error('expected both analyses to succeed')

    expect(second.health.score).toBe(first.health.score)
  })
})

describe('Content Intelligence site-size normalization', () => {
  it('the same absolute affected-page count scores better on a larger analyzed site', async () => {
    const small = buildHealthyPages(10)
    makeThin(small, 3, 0) // 30%

    const large = buildHealthyPages(300)
    makeThin(large, 3, 0) // 1%

    const smallScore = await scoreFor(small)
    const largeScore = await scoreFor(large)
    expect(largeScore).toBeGreaterThan(smallScore)
    expect(largeScore).toBeGreaterThanOrEqual(80)
  })
})

describe('Content Intelligence performance at Bloom Pro scale', () => {
  it('analyzes 500 pages (including duplicate/boilerplate detection) well within a safe time budget — no O(n²) behavior', async () => {
    const pages = buildHealthyPages(500)
    makeExactDuplicates(pages, 50, 0)
    makeHighlyRepetitive(pages, 50, 50)
    makeThin(pages, 50, 100)

    const start = Date.now()
    const score = await scoreFor(pages)
    const elapsedMs = Date.now() - start

    expect(elapsedMs).toBeLessThan(2000)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})
