import type { CrawlPageRow, CrawlLinkRow } from '@/lib/crawler/types'
import { makePage, makeCrawlRun, linkFrom } from './architecture-fixtures'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 27 score-calibration audit — a controlled synthetic site builder
 * for calibration/mutation testing. Builds a well-connected baseline graph
 * (every non-homepage page gets inbound links from the homepage AND three
 * distinct sibling pages, comfortably clearing every check's threshold),
 * then applies named, composable "problems" on top of it one at a time —
 * so mutation tests can start from an identical healthy baseline and
 * introduce exactly one variable at a time.
 *
 * Every mutator takes an `offset` (default 0) selecting WHICH non-homepage
 * pages it targets, via `others.slice(offset, offset + count)`. This
 * matters when COMPOSING multiple mutation types on the same site: without
 * distinct offsets, two mutators both defaulting to "the first N pages"
 * would target the same overlapping pages and interfere with each other
 * (e.g. isolating a page removes the very inbound edges a broken-edge
 * mutation on that same page needs in order to be detected at all, and
 * isolating a page also marks it `discovered_via: 'sitemap'`, which
 * excludes it from the deep-page check by design — see
 * lib/architecture/checks/deep-pages.ts). This is exactly the kind of
 * fixture-authoring mistake the audit's own calibration tests caught
 * during development; callers composing multiple problem types MUST pass
 * non-overlapping offsets.
 */
export type SyntheticSite = {
  pages: CrawlPageRow[]
  links: CrawlLinkRow[]
}

export function buildHealthySite(pageCount: number): SyntheticSite {
  const home = makePage({ url: 'https://example.com/', depth: 0 })
  const others = Array.from({ length: pageCount - 1 }, (_, i) => makePage({ url: `https://example.com/p${i}`, depth: 1 }))
  const pages = [home, ...others]
  const links: CrawlLinkRow[] = []

  for (const page of others) {
    links.push(linkFrom(home, page.url))
    links.push(linkFrom(page, home.url))
  }

  // Cross-link each page to three siblings (i+1, i+2, i+3 mod N) so every
  // page has multiple distinct inbound sources (well above the underlinked
  // threshold) and multiple outgoing links (never a dead end).
  const n = others.length
  for (let i = 0; i < n; i++) {
    for (const offset of [1, 2, 3]) {
      const target = others[(i + offset) % n]
      if (target.url !== others[i].url) links.push(linkFrom(others[i], target.url))
    }
  }

  return { pages, links }
}

function nonHomePages(site: SyntheticSite): CrawlPageRow[] {
  return site.pages.filter((p) => p.depth > 0)
}

export function addRedirectEdges(site: SyntheticSite, count: number, offset = 0): SyntheticSite {
  const targets = nonHomePages(site).slice(offset, offset + count)
  // http_status must reflect the FINAL destination after following the
  // whole redirect chain (see lib/crawler/engine.ts's `http_status:
  // result.finalStatus`) — a real crawled page's http_status is NEVER an
  // intermediate 3xx code. A "redirected but ultimately fine" edge is
  // final_url !== url with a 200 final status; setting http_status to a
  // 3xx here would be unrealistic test data and would incorrectly ALSO
  // trigger the broken-edge check (which correctly treats any non-2xx
  // FINAL status as broken).
  const pages = site.pages.map((page) => (targets.includes(page) ? { ...page, final_url: `${page.url}-final`, http_status: 200 } : page))
  return { pages, links: site.links }
}

export function addBrokenEdges(site: SyntheticSite, count: number, offset = 0): SyntheticSite {
  const targets = nonHomePages(site).slice(offset, offset + count)
  const pages = site.pages.map((page) => (targets.includes(page) ? { ...page, http_status: 404 } : page))
  return { pages, links: site.links }
}

export function makeDeepPages(site: SyntheticSite, count: number, depth = 5, offset = 0): SyntheticSite {
  const targets = nonHomePages(site)
    .filter((p) => p.discovered_via !== 'sitemap')
    .slice(offset, offset + count)
  const pages = site.pages.map((page) => (targets.includes(page) ? { ...page, depth } : page))
  return { pages, links: site.links }
}

/** Removes ALL inbound links to `count` distinct non-homepage pages, making them genuinely isolated (0 inbound). */
export function addIsolatedPages(site: SyntheticSite, count: number, offset = 0): SyntheticSite {
  const home = site.pages.find((p) => p.depth === 0)
  const targets = new Set(nonHomePages(site).slice(offset, offset + count).map((p) => p.url))
  const links = site.links.filter((link) => !targets.has(link.target_url))
  const pages = site.pages.map((page) => (targets.has(page.url) && page !== home ? { ...page, discovered_via: 'sitemap' as const } : page))
  return { pages, links }
}

/** Removes ALL outgoing links from `count` distinct pages, making them dead ends. */
export function addDeadEnds(site: SyntheticSite, count: number, offset = 0): SyntheticSite {
  const sourcePageIdById = new Map(site.pages.map((p) => [p.id, p]))
  const targets = new Set(nonHomePages(site).slice(offset, offset + count).map((p) => p.id))
  const links = site.links.filter((link) => {
    const source = sourcePageIdById.get(link.source_page_id)
    return !source || !targets.has(source.id)
  })
  return { pages: site.pages, links }
}

export function toEvidence(site: SyntheticSite, crawlRunOverrides: Parameters<typeof makeCrawlRun>[0] = {}): CrawlEvidence {
  return { crawlRun: makeCrawlRun(crawlRunOverrides), pages: site.pages, links: site.links }
}
