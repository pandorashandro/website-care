import { describe, expect, it } from 'vitest'
import { analyzeOnPage } from '@/lib/on-page/run-analysis'
import { createFakeOnPageStore } from './helpers/fake-on-page-store'
import {
  buildHealthyPages,
  makeMissingTitles,
  makeTitlesTooShort,
  makeTitlesTooLong,
  makeDuplicateTitles,
  makeMissingMetaDescriptions,
  makeMissingH1,
  toEvidence,
} from './helpers/on-page-synthetic-site'
import type { CrawlPageRow } from '@/lib/crawler/types'

const TIER_SITE_SIZE = 40

async function scoreFor(pages: CrawlPageRow[]): Promise<number> {
  const evidence = toEvidence(pages)
  const store = createFakeOnPageStore({ [evidence.crawlRun.id]: evidence })
  const result = await analyzeOnPage(store, evidence.crawlRun.id)
  if (!result.ok) throw new Error(result.error)
  return result.health.score
}

function buildExcellent(): CrawlPageRow[] {
  return buildHealthyPages(TIER_SITE_SIZE)
}

function buildGood(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeTitlesTooShort(pages, 2, 0)
  return pages
}

function buildModerate(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeMissingMetaDescriptions(pages, 8, 0)
  makeTitlesTooLong(pages, 4, 8)
  return pages
}

function buildPoor(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeMissingTitles(pages, 10, 0)
  makeDuplicateTitles(pages, 8, 10)
  makeMissingMetaDescriptions(pages, 10, 18)
  makeMissingH1(pages, 8, 28)
  return pages
}

function buildSeverelyBroken(): CrawlPageRow[] {
  const pages = buildHealthyPages(TIER_SITE_SIZE)
  makeMissingTitles(pages, 30, 0)
  makeDuplicateTitles(pages, 10, 30)
  makeMissingMetaDescriptions(pages, 40, 0)
  makeMissingH1(pages, 40, 0)
  return pages
}

describe('On-Page SEO score calibration — controlled tiers (Excellent > Good > Moderate > Poor > Severely Broken)', () => {
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

  it('Severely Broken scores low, but not so low it stops being a bounded/explainable number', async () => {
    const score = await scoreFor(buildSeverelyBroken())
    expect(score).toBeLessThan(40)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('Poor scores meaningfully worse than Moderate but meaningfully better than Severely Broken', async () => {
    const [moderate, poor, severe] = await Promise.all([scoreFor(buildModerate()), scoreFor(buildPoor()), scoreFor(buildSeverelyBroken())])
    expect(poor).toBeLessThan(moderate)
    expect(poor).toBeGreaterThan(severe)
  })
})

describe('On-Page SEO mutation testing', () => {
  it('adding a real problem never improves the score', async () => {
    const healthy = buildHealthyPages(TIER_SITE_SIZE)
    const withProblem = buildHealthyPages(TIER_SITE_SIZE)
    makeMissingTitles(withProblem, 1, 0)

    expect(await scoreFor(withProblem)).toBeLessThanOrEqual(await scoreFor(healthy))
  })

  it('fixing a problem never reduces the score', async () => {
    const broken = buildPoor()
    const fixed = broken.map((page, i) => (i < 10 ? { ...page, title: `Fixed Unique Title Number ${i} Right Here` } : page))

    const brokenScore = await scoreFor(broken)
    const fixedScore = await scoreFor(fixed)
    expect(fixedScore).toBeGreaterThanOrEqual(brokenScore)
  })

  it('increasing affected-page prevalence of the same problem never improves the score', async () => {
    const narrow = buildHealthyPages(TIER_SITE_SIZE)
    makeMissingTitles(narrow, 2, 0)

    const wide = buildHealthyPages(TIER_SITE_SIZE)
    makeMissingTitles(wide, 20, 0)

    expect(await scoreFor(wide)).toBeLessThanOrEqual(await scoreFor(narrow))
  })

  it('a duplicate-title group spanning many pages does not create combinatorial (pairwise) score collapse', async () => {
    const pages = buildHealthyPages(TIER_SITE_SIZE)
    makeDuplicateTitles(pages, 20, 0) // C(20,2) = 190 pairs if scored naively -- must not zero out the score
    const score = await scoreFor(pages)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeGreaterThanOrEqual(40) // one high-severity finding, tier-capped
  })

  it('adding healthy eligible pages to an already-flawed site improves (or preserves) the proportional score', async () => {
    const small = buildHealthyPages(10)
    makeMissingTitles(small, 2, 0) // 20% affected

    const scaled = buildHealthyPages(100)
    makeMissingTitles(scaled, 2, 0) // 2% affected -- same absolute count, larger healthy population

    expect(await scoreFor(scaled)).toBeGreaterThanOrEqual(await scoreFor(small))
  })

  it('duplicating the same underlying evidence twice (re-running analysis) does not additionally destroy the score', async () => {
    const pages = buildPoor()
    const evidence = toEvidence(pages)
    const store = createFakeOnPageStore({ [evidence.crawlRun.id]: evidence })

    const first = await analyzeOnPage(store, evidence.crawlRun.id)
    const second = await analyzeOnPage(store, evidence.crawlRun.id)
    if (!first.ok || !second.ok) throw new Error('expected both analyses to succeed')

    expect(second.health.score).toBe(first.health.score)
  })
})

describe('On-Page SEO site-size normalization', () => {
  it('the same absolute affected-page count scores better on a larger analyzed site', async () => {
    const small = buildHealthyPages(10)
    makeMissingTitles(small, 3, 0) // 30%

    const large = buildHealthyPages(300)
    makeMissingTitles(large, 3, 0) // 1%

    const smallScore = await scoreFor(small)
    const largeScore = await scoreFor(large)
    expect(largeScore).toBeGreaterThan(smallScore)
    expect(smallScore).toBeGreaterThanOrEqual(40) // neither collapses to near-zero
    expect(largeScore).toBeGreaterThanOrEqual(80)
  })
})
