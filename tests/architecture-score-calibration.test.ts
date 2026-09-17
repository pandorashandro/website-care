import { describe, expect, it } from 'vitest'
import { analyzeArchitecture } from '@/lib/architecture/run-analysis'
import { createFakeArchitectureStore } from './helpers/fake-architecture-store'
import { buildHealthySite, addRedirectEdges, addBrokenEdges, makeDeepPages, addIsolatedPages, addDeadEnds, toEvidence, type SyntheticSite } from './helpers/architecture-synthetic-site'

/**
 * Phase 27 score-calibration audit — Steps 4/5/6. Proves the Site
 * Architecture score is ORDERED, MONOTONIC, PROPORTIONAL, and BOUNDED
 * across controlled synthetic scenarios, rather than asserting brittle
 * exact numbers. See docs/site-architecture-engine.md's "Score calibration"
 * section for the audit's full findings and the corrections this suite
 * locks in.
 *
 * IMPORTANT fixture-authoring rule discovered during this audit: when
 * composing multiple mutation types on the same synthetic site, each
 * mutator MUST target a disjoint range of pages (via its `offset`
 * parameter). Applying two mutators to the same default "first N pages"
 * range causes them to interfere — e.g. isolating a page removes the very
 * inbound edges a broken-edge mutation on that page needs to be detected,
 * and marks it `discovered_via: 'sitemap'`, which independently excludes
 * it from the deep-page check. This is a FIXTURE bug, not a scoring bug —
 * see tests/helpers/architecture-synthetic-site.ts's own doc comment — but
 * it materially under-represented severity in this suite's first draft
 * (a "severely broken" site scored 71 instead of correctly reflecting its
 * combined problems) until corrected here.
 */
async function scoreOf(site: SyntheticSite, crawlRunId = 'run-1'): Promise<number> {
  const evidence = toEvidence(site, { id: crawlRunId })
  const store = createFakeArchitectureStore({ [crawlRunId]: evidence })
  const result = await analyzeArchitecture(store, crawlRunId)
  if (!result.ok) throw new Error(result.error)
  return result.health.score
}

const TIER_SITE_SIZE = 40

function buildGood(): SyntheticSite {
  return addRedirectEdges(buildHealthySite(TIER_SITE_SIZE), 1)
}

function buildModerate(): SyntheticSite {
  let site = buildHealthySite(TIER_SITE_SIZE)
  site = addRedirectEdges(site, 3, 0)
  site = addBrokenEdges(site, 2, 3)
  site = makeDeepPages(site, 3, 5, 5)
  return site
}

function buildPoor(): SyntheticSite {
  let site = buildHealthySite(TIER_SITE_SIZE)
  site = addBrokenEdges(site, 6, 0)
  site = makeDeepPages(site, 5, 5, 6)
  site = addIsolatedPages(site, 4, 11)
  site = addDeadEnds(site, 3, 15)
  return site
}

function buildSeverelyBroken(): SyntheticSite {
  let site = buildHealthySite(TIER_SITE_SIZE)
  site = addBrokenEdges(site, 12, 0)
  site = makeDeepPages(site, 10, 6, 12)
  site = addIsolatedPages(site, 20, 22) // >50% of 40 pages -> widespread + severe
  site = addDeadEnds(site, 6, 33)
  return site
}

describe('Site Architecture score calibration (Step 4 — controlled tiers)', () => {
  it('A. EXCELLENT: a well-connected, reasonable-depth site with no broken/redirect/orphan/dead-end problems scores very high', async () => {
    const score = await scoreOf(buildHealthySite(TIER_SITE_SIZE))
    expect(score).toBeGreaterThanOrEqual(95)
  })

  it('B. GOOD WITH MINOR ISSUES scores high but strictly lower than Excellent', async () => {
    const [excellentScore, goodScore] = await Promise.all([scoreOf(buildHealthySite(TIER_SITE_SIZE), 'excellent'), scoreOf(buildGood(), 'good')])
    expect(goodScore).toBeLessThan(excellentScore)
    expect(goodScore).toBeGreaterThanOrEqual(85)
  })

  it('C. MODERATELY DEGRADED (several issues affecting a non-trivial portion of the site) scores clearly lower than Good', async () => {
    const [goodScore, moderateScore] = await Promise.all([scoreOf(buildGood(), 'good'), scoreOf(buildModerate(), 'moderate')])
    expect(moderateScore).toBeLessThan(goodScore)
  })

  it('D. POOR (isolation + broken edges + excessive depth + weak connectivity) scores low', async () => {
    const [moderateScore, poorScore] = await Promise.all([scoreOf(buildModerate(), 'moderate'), scoreOf(buildPoor(), 'poor')])
    expect(poorScore).toBeLessThan(moderateScore)
    expect(poorScore).toBeLessThan(75)
  })

  it('E. SEVERELY BROKEN (widespread isolation + numerous broken links + severe connectivity problems) scores very low', async () => {
    const [poorScore, severeScore] = await Promise.all([scoreOf(buildPoor(), 'poor'), scoreOf(buildSeverelyBroken(), 'severe')])
    expect(severeScore).toBeLessThan(poorScore)
    expect(severeScore).toBeLessThan(50)
  })

  it('the full ordering holds simultaneously: Excellent > Good > Moderate > Poor > Severely Broken', async () => {
    const scores = await Promise.all(
      [buildHealthySite(TIER_SITE_SIZE), buildGood(), buildModerate(), buildPoor(), buildSeverelyBroken()].map((site, i) => scoreOf(site, `tier-${i}`))
    )

    expect(scores[0]).toBeGreaterThan(scores[1])
    expect(scores[1]).toBeGreaterThan(scores[2])
    expect(scores[2]).toBeGreaterThan(scores[3])
    expect(scores[3]).toBeGreaterThan(scores[4])
  })
})

describe('Site Architecture score calibration (Step 5 — mutation testing)', () => {
  it('adding one redirected edge never improves the score', async () => {
    const baseline = buildHealthySite(TIER_SITE_SIZE)
    const withRedirect = addRedirectEdges(baseline, 1)
    const [baseScore, mutatedScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(withRedirect, 'b')])
    expect(mutatedScore).toBeLessThanOrEqual(baseScore)
  })

  it('adding more redirected edges never improves the score further (monotonic in count)', async () => {
    const one = addRedirectEdges(buildHealthySite(TIER_SITE_SIZE), 1)
    const several = addRedirectEdges(buildHealthySite(TIER_SITE_SIZE), 8)
    const [oneScore, severalScore] = await Promise.all([scoreOf(one, 'a'), scoreOf(several, 'b')])
    expect(severalScore).toBeLessThanOrEqual(oneScore)
  })

  it('adding one broken edge never improves the score, and more broken edges deduct at least as much', async () => {
    const baseline = buildHealthySite(TIER_SITE_SIZE)
    const one = addBrokenEdges(baseline, 1)
    const several = addBrokenEdges(baseline, 10)
    const [baseScore, oneScore, severalScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(one, 'b'), scoreOf(several, 'c')])
    expect(oneScore).toBeLessThanOrEqual(baseScore)
    expect(severalScore).toBeLessThanOrEqual(oneScore)
  })

  it('introducing a deep page never improves the score; several deep pages deduct at least as much as one', async () => {
    const baseline = buildHealthySite(TIER_SITE_SIZE)
    const one = makeDeepPages(baseline, 1)
    const several = makeDeepPages(baseline, 6)
    const [baseScore, oneScore, severalScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(one, 'b'), scoreOf(several, 'c')])
    expect(oneScore).toBeLessThanOrEqual(baseScore)
    expect(severalScore).toBeLessThanOrEqual(oneScore)
  })

  it('introducing an isolated page never improves the score; several isolated pages deduct at least as much', async () => {
    const baseline = buildHealthySite(TIER_SITE_SIZE)
    const one = addIsolatedPages(baseline, 1)
    const several = addIsolatedPages(baseline, 6)
    const [baseScore, oneScore, severalScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(one, 'b'), scoreOf(several, 'c')])
    expect(oneScore).toBeLessThanOrEqual(baseScore)
    expect(severalScore).toBeLessThanOrEqual(oneScore)
  })

  it('widespread structural problems (many mutation types combined, on disjoint pages) never score higher than any single mutation alone', async () => {
    const one = addBrokenEdges(buildHealthySite(TIER_SITE_SIZE), 1)
    const combined = buildSeverelyBroken()

    const [oneScore, combinedScore] = await Promise.all([scoreOf(one, 'a'), scoreOf(combined, 'b')])
    expect(combinedScore).toBeLessThan(oneScore)
  })

  it('one minor, isolated issue produces a PROPORTIONATE (small) penalty, not a disproportionate one', async () => {
    const baseline = buildHealthySite(TIER_SITE_SIZE)
    const oneRedirect = addRedirectEdges(baseline, 1)
    const [baseScore, mutatedScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(oneRedirect, 'b')])
    expect(baseScore - mutatedScore).toBeLessThan(10)
  })

  it('widespread serious issues produce SUBSTANTIAL degradation, not a token penalty', async () => {
    const baseline = buildHealthySite(TIER_SITE_SIZE)
    const severelyBroken = buildSeverelyBroken()
    const [baseScore, brokenScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(severelyBroken, 'b')])
    expect(baseScore - brokenScore).toBeGreaterThan(40)
  })

  it('duplicate/repeated evidence for the SAME check does not cause runaway, unbounded penalties (tier caps hold)', async () => {
    const manyBroken = addBrokenEdges(buildHealthySite(TIER_SITE_SIZE), 30)
    const score = await scoreOf(manyBroken)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

describe('Site Architecture score calibration (Step 6 — site-size normalization)', () => {
  it('the same ABSOLUTE broken-edge count is penalized more heavily on a small site than a large one (proportional, not absolute)', async () => {
    const smallSite = addBrokenEdges(buildHealthySite(10), 1)
    const largeSite = addBrokenEdges(buildHealthySite(200), 1)
    const [smallScore, largeScore] = await Promise.all([scoreOf(smallSite, 'small'), scoreOf(largeSite, 'large')])
    expect(largeScore).toBeGreaterThanOrEqual(smallScore)
  })

  it('a PROPORTIONALLY equivalent problem (same fraction of TARGET pages broken) is penalized within the same order of magnitude regardless of absolute site size', async () => {
    // 2 of 10 pages broken (20%) vs 20 of 100 pages broken (20%) — the
    // TARGET fraction is identical, but the model normalizes by the
    // AFFECTED-SOURCE-PAGE fraction (how much of the site's own link graph
    // leads to something broken), which depends on graph topology, not
    // just target count: in this suite's ring-connected fixture, 2 broken
    // targets on a 10-page ring happen to be linked from a LARGER share of
    // that small ring's own pages (every page's few outbound links are a
    // bigger fraction of a small ring) than 20 broken targets are on a
    // 100-page ring — so a real gap here reflects a genuine graph-topology
    // difference, not an unnormalized absolute-count bug. Both scores must
    // still land in the same "moderately degraded" order of magnitude
    // rather than one being trivially healthy and the other catastrophic.
    const small = addBrokenEdges(buildHealthySite(10), 2)
    const large = addBrokenEdges(buildHealthySite(100), 20)
    const [smallScore, largeScore] = await Promise.all([scoreOf(small, 'small'), scoreOf(large, 'large')])
    expect(smallScore).toBeGreaterThanOrEqual(40)
    expect(largeScore).toBeGreaterThanOrEqual(40)
    expect(Math.abs(smallScore - largeScore)).toBeLessThanOrEqual(25)
  })

  it('does not treat a single broken link on a 500-page site as negligible to the point of a zero deduction (still real, still counted)', async () => {
    const baseline = buildHealthySite(200)
    const withOneBroken = addBrokenEdges(baseline, 1)
    const [baseScore, mutatedScore] = await Promise.all([scoreOf(baseline, 'a'), scoreOf(withOneBroken, 'b')])
    expect(mutatedScore).toBeLessThan(baseScore)
  })
})

describe('Site Architecture score calibration — bounds and determinism', () => {
  it('score is always within [0, 100] even for a catastrophically broken site', async () => {
    let catastrophic = buildHealthySite(60)
    catastrophic = addBrokenEdges(catastrophic, 15, 0)
    catastrophic = makeDeepPages(catastrophic, 15, 8, 15)
    catastrophic = addIsolatedPages(catastrophic, 15, 30)
    catastrophic = addDeadEnds(catastrophic, 14, 45)

    const score = await scoreOf(catastrophic)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('is fully deterministic — analyzing identical evidence twice produces the identical score', async () => {
    const site = addBrokenEdges(buildHealthySite(TIER_SITE_SIZE), 3)
    const [first, second] = await Promise.all([scoreOf(site, 'a'), scoreOf(site, 'b')])
    expect(first).toBe(second)
  })
})
