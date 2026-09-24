import type { CrawlPageRow } from '@/lib/crawler/types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'
import { makePage, makeEvidence, linkFrom } from './architecture-fixtures'

/**
 * Scoring Engine V2 (2026-09-24) — WEBIOOM VALIDATION LAB.
 *
 * Deterministic, local, fixture-based ground-truth scenarios for the
 * scoring engine's regression suite (tests/validation-lab.test.ts). Every
 * scenario here is a plain in-memory `CrawlEvidence` object (crawl_run +
 * crawl_pages + crawl_links) — no live HTTP, no third-party website, no
 * network call of any kind — fed directly into the REAL production
 * `analyzeTechnicalSeo`/`analyzeOnPage`/`analyzeArchitecture`/
 * `analyzeContent`/`analyzePerformance`/`analyzeAccessibility`/
 * `analyzeSecurity` functions via each engine's existing fake store (see
 * tests/helpers/fake-*-store.ts), so this suite exercises the actual
 * production scoring pipeline end to end, never a reimplementation of it.
 *
 * Reuses tests/helpers/architecture-fixtures.ts's `makePage`/`makeCrawlRun`/
 * `makeEvidence`/`linkFrom` builders (already generic across every engine,
 * despite the filename) rather than inventing a second, competing fixture
 * model.
 *
 * IMPORTANT DEFAULT TO KNOW: `makePage()`'s own default
 * `security_evidence: {}` reads as `isHttps: false` (see
 * lib/security/evidence.ts's DEFAULTS) — every "healthy" page fixture below
 * explicitly sets `security_evidence: { isHttps: true, ... }` so a fixture
 * meant to be clean is not accidentally also a not_using_https regression.
 */

// ---------------------------------------------------------------------------
// Shared content blocks
// ---------------------------------------------------------------------------

/** Comfortably above every page-type's SUBSTANTIVE_EVALUATION_FLOOR (150 words) and every thin-content threshold — genuine, distinct, multi-paragraph prose per page (never reused verbatim across pages in the SAME fixture, to avoid accidentally tripping exact-duplicate-content). */
const RICH_HOME_TEXT = [
  'Our small team designs and builds custom furniture for clients who want something that fits their space exactly, rather than settling for whatever a big-box store happens to stock this season.',
  'Every project starts with a conversation about how the piece will actually be used day to day, what materials feel right, and what budget makes sense before a single board is cut.',
  'We keep a running portfolio of finished commissions on this site, along with honest notes about lead times, so a new visitor can get a realistic sense of what working with us looks like.',
  'Most clients reach out after seeing a piece in person at a friend\'s house, which is exactly the kind of word-of-mouth relationship we try to earn on every single job we take on.',
].join('\n\n')

const RICH_ABOUT_TEXT = [
  'The workshop started in a two-car garage a decade ago and has since grown into a small studio with three full-time woodworkers and one apprentice learning the trade on real client work.',
  'We source hardwood from a handful of regional mills we have worked with for years, favoring species that are locally available over anything that has to travel a long distance to reach us.',
  'Sustainability is not a marketing line here — offcuts become smaller items like cutting boards and coasters, and sawdust goes to a nearby farm rather than a landfill.',
  'If you want to see the space in person, we run an open shop day on the first Saturday of every month, no appointment needed.',
].join('\n\n')

const RICH_SERVICES_TEXT = [
  'Custom dining tables, built-in shelving, and one-off statement pieces make up the bulk of our commissioned work, each priced individually based on materials and joinery complexity.',
  'A typical table commission runs eight to twelve weeks from signed quote to delivery, with two check-in points along the way so there are no surprises at pickup.',
  'We also take on smaller repair and refinishing jobs for existing furniture, which is often a faster and far less expensive alternative to replacing a piece entirely.',
  'Delivery and installation within a two-hour radius is included in every quote; anything further is arranged case by case.',
].join('\n\n')

const RICH_CONTACT_TEXT = [
  'The best way to start a project is to send a few photos or sketches of what you have in mind along with rough dimensions for the space it needs to fit.',
  'We reply to every inquiry within two business days, and an initial phone or video call is free with no obligation to move forward afterward.',
  'For existing clients checking on an order in progress, please include your original quote number so we can pull up the right project quickly.',
].join('\n\n')

/** A short, generic, placeholder-style page — the deliberate opposite of the RICH_* blocks above. Roughly 20 words, well under every thin-content threshold. */
const PLACEHOLDER_TEXT = 'Welcome to our website. This page is currently under construction. Please check back again soon for more information.'

/** Virtually no visible text at all — a technically valid HTML response with almost nothing in it. */
const NEAR_EMPTY_TEXT = 'Coming soon.'

function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length
}

const HEALTHY_SECURITY_EVIDENCE = { isHttps: true, mixedContentCount: 0, insecureFormCount: 0 }

/**
 * A page with rich, substantive, distinct content and every clean
 * HTTPS/security/canonical default — the shared baseline every "healthy"
 * fixture page starts from.
 *
 * Self-referencing canonical by default, matching what a genuinely clean
 * page actually has (a fixture that forgot to set this is not "healthy,"
 * it is an accidental missing_canonical finding).
 *
 * `content_hash` is derived from the ACTUAL content_text rather than left
 * at makePage()'s own fixed default constant — lib/content/checks/
 * exact-duplicate.ts groups pages by content_hash alone, so two fixture
 * pages with genuinely different prose but the same default hash would
 * otherwise be spuriously reported as word-for-word duplicates (a real
 * bug this Validation Lab itself caught during its own construction).
 */
function healthyPage(overrides: Partial<CrawlPageRow> & { url: string; content_text: string }): CrawlPageRow {
  return makePage({
    security_evidence: HEALTHY_SECURITY_EVIDENCE,
    canonical_url: overrides.url,
    content_word_count: countWords(overrides.content_text),
    content_paragraph_count: overrides.content_text.split('\n\n').length,
    content_hash: overrides.content_text,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// 1. Healthy multi-page site
// ---------------------------------------------------------------------------
export function healthyMultiPageSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://woodcraft.example/', depth: 0, discovered_via: 'seed', title: 'Custom Furniture Workshop | Woodcraft Studio', meta_description: 'Handmade custom furniture built to fit your space, from dining tables to built-in shelving.', h1_text: 'Custom Furniture, Built for Your Space', content_text: RICH_HOME_TEXT })
  const about = healthyPage({ url: 'https://woodcraft.example/about', depth: 1, title: 'About Woodcraft Studio', meta_description: 'The story of our small furniture workshop and the team behind every commission.', h1_text: 'About the Workshop', content_text: RICH_ABOUT_TEXT })
  const services = healthyPage({ url: 'https://woodcraft.example/services', depth: 1, title: 'Furniture Commissions & Repairs', meta_description: 'Custom tables, shelving, and furniture repair services with realistic timelines and pricing.', h1_text: 'What We Build', content_text: RICH_SERVICES_TEXT })
  const contact = healthyPage({ url: 'https://woodcraft.example/contact', depth: 1, title: 'Contact Woodcraft Studio', meta_description: 'Start a custom furniture project or check on an existing order.', h1_text: 'Get in Touch', content_text: RICH_CONTACT_TEXT })

  const pages = [home, about, services, contact]
  const links = [
    linkFrom(home, about.url),
    linkFrom(home, services.url),
    linkFrom(home, contact.url),
    linkFrom(about, home.url),
    linkFrom(services, home.url),
    linkFrom(services, contact.url),
    linkFrom(contact, home.url),
  ]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 2. Healthy small site (legitimately compact, must not be punished)
// ---------------------------------------------------------------------------
export function healthySmallSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://smallstudio.example/', depth: 0, discovered_via: 'seed', title: 'Smallstudio — Freelance Brand Design', meta_description: 'One-person brand design studio taking on a small number of projects each year.', h1_text: 'Brand Design, One Project at a Time', content_text: RICH_HOME_TEXT })
  const about = healthyPage({ url: 'https://smallstudio.example/about', depth: 1, title: 'About Smallstudio', meta_description: 'Who runs Smallstudio and how projects are chosen.', h1_text: 'About', content_text: RICH_ABOUT_TEXT })

  const pages = [home, about]
  const links = [linkFrom(home, about.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 3. Placeholder site (the reported failure shape)
// ---------------------------------------------------------------------------
export function placeholderSite(): CrawlEvidence {
  const home = makePage({
    url: 'https://newbusiness.example/',
    depth: 0,
    discovered_via: 'seed',
    title: 'Home',
    meta_description: 'Home page',
    h1_text: 'Welcome',
    h1_count: 1,
    content_text: PLACEHOLDER_TEXT,
    content_word_count: countWords(PLACEHOLDER_TEXT),
    content_paragraph_count: 1,
    content_heading_texts: [],
    canonical_url: 'https://newbusiness.example/',
    security_evidence: HEALTHY_SECURITY_EVIDENCE,
  })

  return makeEvidence({ pages: [home], links: [] })
}

// ---------------------------------------------------------------------------
// 4. Empty / near-empty site
// ---------------------------------------------------------------------------
export function emptySite(): CrawlEvidence {
  const home = makePage({
    url: 'https://blank.example/',
    depth: 0,
    discovered_via: 'seed',
    title: 'Untitled',
    meta_description: null,
    h1_text: null,
    h1_count: 0,
    content_text: NEAR_EMPTY_TEXT,
    content_word_count: countWords(NEAR_EMPTY_TEXT),
    content_paragraph_count: 1,
    content_heading_texts: [],
    canonical_url: 'https://blank.example/',
    security_evidence: HEALTHY_SECURITY_EVIDENCE,
  })

  return makeEvidence({ pages: [home], links: [] })
}

// ---------------------------------------------------------------------------
// 5. Technically clean but thin site
// ---------------------------------------------------------------------------
export function technicallyCleanThinSite(): CrawlEvidence {
  const home = makePage({
    url: 'https://cleanthin.example/',
    depth: 0,
    discovered_via: 'seed',
    title: 'Clean Thin Co. — Precision Parts',
    meta_description: 'Precision-machined parts for small manufacturing runs.',
    h1_text: 'Precision Parts, Small Runs',
    h1_count: 1,
    content_text: PLACEHOLDER_TEXT,
    content_word_count: countWords(PLACEHOLDER_TEXT),
    content_paragraph_count: 1,
    content_heading_texts: [],
    canonical_url: 'https://cleanthin.example/',
    robots_allowed: true,
    noindex: false,
    security_evidence: HEALTHY_SECURITY_EVIDENCE,
  })

  return makeEvidence({ pages: [home], links: [], crawlRun: { robots_status: 'ok', sitemap_status: 'ok' } })
}

// ---------------------------------------------------------------------------
// 6. Large broken site
// ---------------------------------------------------------------------------
export function largeBrokenSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://brokensite.example/', depth: 0, discovered_via: 'seed', title: 'Brokensite Inc.', meta_description: 'A site with real, systemic problems.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })

  const missingTitlePages = Array.from({ length: 4 }, (_, i) => {
    const text = `${RICH_SERVICES_TEXT}\n\nProduct detail ${i}.`
    return makePage({
      url: `https://brokensite.example/product-${i}`,
      depth: 1,
      title: null,
      meta_description: null,
      h1_text: `Product ${i}`,
      canonical_url: `https://brokensite.example/product-${i}`,
      content_text: text,
      content_word_count: countWords(text),
      content_hash: text,
      security_evidence: HEALTHY_SECURITY_EVIDENCE,
    })
  })

  const brokenPages = Array.from({ length: 3 }, (_, i) =>
    makePage({
      url: `https://brokensite.example/broken-${i}`,
      depth: 1,
      status: 'completed',
      http_status: 404,
      title: null,
      meta_description: null,
      content_text: '',
      content_word_count: 0,
      security_evidence: HEALTHY_SECURITY_EVIDENCE,
    })
  )

  const pages = [home, ...missingTitlePages, ...brokenPages]
  const links = [
    ...missingTitlePages.map((p) => linkFrom(home, p.url)),
    ...brokenPages.map((p) => linkFrom(home, p.url)),
  ]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 7. Mixed-quality site
// ---------------------------------------------------------------------------
export function mixedQualitySite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://mixedsite.example/', depth: 0, discovered_via: 'seed', title: 'Mixed Quality Co.', meta_description: 'Some pages here are solid, others need work.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const about = healthyPage({ url: 'https://mixedsite.example/about', depth: 1, title: 'About Mixed Quality Co.', meta_description: 'Our story, told properly.', h1_text: 'About Us', content_text: RICH_ABOUT_TEXT })
  const thinOne = makePage({ url: 'https://mixedsite.example/thin-1', depth: 1, title: null, content_text: PLACEHOLDER_TEXT, content_word_count: countWords(PLACEHOLDER_TEXT), security_evidence: HEALTHY_SECURITY_EVIDENCE })
  const thinTwo = makePage({ url: 'https://mixedsite.example/thin-2', depth: 1, title: null, content_text: PLACEHOLDER_TEXT, content_word_count: countWords(PLACEHOLDER_TEXT), security_evidence: HEALTHY_SECURITY_EVIDENCE })

  const pages = [home, about, thinOne, thinTwo]
  const links = [linkFrom(home, about.url), linkFrom(home, thinOne.url), linkFrom(home, thinTwo.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 8. Duplicate metadata site
// ---------------------------------------------------------------------------
export function duplicateMetadataSite(): CrawlEvidence {
  const SHARED_TITLE = 'Our Products'
  const SHARED_DESCRIPTION = 'Browse our full range of products.'

  const home = healthyPage({ url: 'https://dupsite.example/', depth: 0, discovered_via: 'seed', title: 'Dupsite Home', meta_description: 'The homepage, correctly unique.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const productA = healthyPage({ url: 'https://dupsite.example/product-a', depth: 1, title: SHARED_TITLE, meta_description: SHARED_DESCRIPTION, h1_text: 'Product A', content_text: RICH_SERVICES_TEXT })
  const productB = healthyPage({ url: 'https://dupsite.example/product-b', depth: 1, title: SHARED_TITLE, meta_description: SHARED_DESCRIPTION, h1_text: 'Product B', content_text: RICH_ABOUT_TEXT })

  const pages = [home, productA, productB]
  const links = [linkFrom(home, productA.url), linkFrom(home, productB.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 9. Broken internal-link site
// ---------------------------------------------------------------------------
export function brokenInternalLinkSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://brokenlink.example/', depth: 0, discovered_via: 'seed', title: 'Brokenlink Co.', meta_description: 'A site with one genuinely broken internal link.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const about = healthyPage({ url: 'https://brokenlink.example/about', depth: 1, title: 'About Brokenlink Co.', meta_description: 'Our story.', h1_text: 'About', content_text: RICH_ABOUT_TEXT })
  const goneePage = makePage({ url: 'https://brokenlink.example/discontinued-product', depth: 1, http_status: 404, title: null, content_text: '', content_word_count: 0, security_evidence: HEALTHY_SECURITY_EVIDENCE })

  const pages = [home, about, goneePage]
  const links = [linkFrom(home, about.url), linkFrom(home, goneePage.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 10. Noindex site (intentional utility page)
// ---------------------------------------------------------------------------
export function noindexSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://noindexsite.example/', depth: 0, discovered_via: 'seed', title: 'Noindexsite Co.', meta_description: 'A normal site with one intentionally noindexed utility page.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const about = healthyPage({ url: 'https://noindexsite.example/about', depth: 1, title: 'About Noindexsite Co.', meta_description: 'Our story.', h1_text: 'About', content_text: RICH_ABOUT_TEXT })
  const thankYouText = 'Thank you for contacting us. We will respond within two business days.'
  const thankYou = makePage({
    url: 'https://noindexsite.example/thank-you',
    depth: 1,
    noindex: true,
    canonical_url: 'https://noindexsite.example/thank-you',
    title: 'Thank You',
    meta_description: 'Thank you for your submission.',
    content_text: thankYouText,
    content_word_count: countWords(thankYouText),
    content_hash: thankYouText,
    security_evidence: HEALTHY_SECURITY_EVIDENCE,
  })

  const pages = [home, about, thankYou]
  const links = [linkFrom(home, about.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 11. Canonical-conflict site
// ---------------------------------------------------------------------------
export function canonicalConflictSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://canonicalconflict.example/', depth: 0, discovered_via: 'seed', title: 'Canonicalconflict Co.', meta_description: 'A site with one canonical URL pointing at a page that itself is not indexable.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const target = makePage({
    url: 'https://canonicalconflict.example/target',
    depth: 1,
    noindex: true,
    canonical_url: 'https://canonicalconflict.example/target',
    title: 'Target Page',
    content_text: RICH_ABOUT_TEXT,
    content_word_count: countWords(RICH_ABOUT_TEXT),
    security_evidence: HEALTHY_SECURITY_EVIDENCE,
  })
  const source = healthyPage({
    url: 'https://canonicalconflict.example/source',
    depth: 1,
    title: 'Source Page',
    meta_description: 'Points its canonical at a noindexed page.',
    h1_text: 'Source',
    content_text: RICH_SERVICES_TEXT,
    canonical_url: 'https://canonicalconflict.example/target',
  })

  const pages = [home, target, source]
  const links = [linkFrom(home, source.url), linkFrom(home, target.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 12. Accessibility-defect site
// ---------------------------------------------------------------------------
export function accessibilityDefectSite(): CrawlEvidence {
  const home = healthyPage({
    url: 'https://a11ydefect.example/',
    depth: 0,
    discovered_via: 'seed',
    title: 'A11ydefect Co.',
    meta_description: 'A site with real, observable accessibility defects webioom can detect from static HTML.',
    h1_text: 'Welcome',
    content_text: RICH_HOME_TEXT,
    accessibility_evidence: { imageCount: 6, imagesMissingAltCount: 6, htmlLang: null, formInputsMissingLabelCount: 2 },
  })
  const about = healthyPage({ url: 'https://a11ydefect.example/about', depth: 1, title: 'About A11ydefect Co.', meta_description: 'Our story.', h1_text: 'About', content_text: RICH_ABOUT_TEXT })

  const pages = [home, about]
  const links = [linkFrom(home, about.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 13. Security-signal-defect site
// ---------------------------------------------------------------------------
export function securitySignalDefectSite(): CrawlEvidence {
  const home = healthyPage({
    url: 'https://insecuresite.example/',
    depth: 0,
    discovered_via: 'seed',
    title: 'Insecuresite Co.',
    meta_description: 'A site with observable, static security signals webioom can actually detect.',
    h1_text: 'Welcome',
    content_text: RICH_HOME_TEXT,
    security_evidence: { isHttps: false, mixedContentCount: 0, insecureFormCount: 1 },
  })
  const about = healthyPage({ url: 'https://insecuresite.example/about', depth: 1, title: 'About Insecuresite Co.', meta_description: 'Our story.', h1_text: 'About', content_text: RICH_ABOUT_TEXT })

  const pages = [home, about]
  const links = [linkFrom(home, about.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// 14. Partial-evidence site (crawl stopped before finishing)
// ---------------------------------------------------------------------------
export function partialEvidenceSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://partialsite.example/', depth: 0, discovered_via: 'seed', title: 'Partialsite Co.', meta_description: 'A crawl that stopped partway through.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const neverFetched = makePage({ url: 'https://partialsite.example/never-reached', depth: 1, status: 'queued', http_status: null, title: null, content_text: null, content_word_count: 0, security_evidence: HEALTHY_SECURITY_EVIDENCE })

  const pages = [home, neverFetched]
  const links = [linkFrom(home, neverFetched.url)]

  return makeEvidence({ pages, links, crawlRun: { status: 'partial' } })
}

// ---------------------------------------------------------------------------
// 15. Not-applicable case (no structured data anywhere — absence is not a defect)
// ---------------------------------------------------------------------------
export function notApplicableStructuredDataSite(): CrawlEvidence {
  const home = healthyPage({ url: 'https://noschemasite.example/', depth: 0, discovered_via: 'seed', title: 'Noschemasite Co.', meta_description: 'A perfectly ordinary site with no structured data at all.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT, structured_data_present: false, structured_data_valid: null })
  const about = healthyPage({ url: 'https://noschemasite.example/about', depth: 1, title: 'About Noschemasite Co.', meta_description: 'Our story.', h1_text: 'About', content_text: RICH_ABOUT_TEXT, structured_data_present: false, structured_data_valid: null })

  const pages = [home, about]
  const links = [linkFrom(home, about.url), linkFrom(about, home.url)]

  return makeEvidence({ pages, links })
}

// ---------------------------------------------------------------------------
// Adversarial: a genuinely meaningful, coherent ONE-PAGE site ("G") to
// contrast directly against placeholderSite ("H") — same page count, very
// different substance, so a page-count-based rule could not tell them apart
// but a substance-aware model must.
// ---------------------------------------------------------------------------
export function oneMeaningfulPageSite(): CrawlEvidence {
  const home = healthyPage({
    url: 'https://onepageportfolio.example/',
    depth: 0,
    discovered_via: 'seed',
    title: 'Jordan Lee — Freelance Illustrator',
    meta_description: 'Portfolio and booking information for freelance illustrator Jordan Lee.',
    h1_text: 'Illustration for Editorial and Publishing Clients',
    content_text: [RICH_HOME_TEXT, RICH_ABOUT_TEXT, RICH_CONTACT_TEXT].join('\n\n'),
    content_heading_texts: ['Selected Work', 'Process', 'Booking'],
  })

  return makeEvidence({ pages: [home], links: [] })
}

// ---------------------------------------------------------------------------
// Adversarial B: 100 pages sharing ONE identical, minor, template-level
// defect (missing meta description) — must not be multiplied into 100
// independent full deductions.
// ---------------------------------------------------------------------------
export function repeatedMinorDefectSite(pageCount = 100): CrawlEvidence {
  const home = healthyPage({ url: 'https://repeatedminor.example/', depth: 0, discovered_via: 'seed', title: 'Repeatedminor Co.', meta_description: 'A large site missing meta descriptions everywhere from one template bug.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const pages = Array.from({ length: pageCount }, (_, i) =>
    healthyPage({ url: `https://repeatedminor.example/page-${i}`, depth: 1, title: `Page ${i} — Repeatedminor Co.`, meta_description: null, h1_text: `Page ${i}`, content_text: `${RICH_SERVICES_TEXT}\n\nUnique detail for page ${i}.` })
  )

  const links = pages.map((p) => linkFrom(home, p.url))
  return makeEvidence({ pages: [home, ...pages], links })
}

// ---------------------------------------------------------------------------
// Adversarial C: one SEVERE, systemic technical defect (most pages return
// 404) vs an otherwise clean site — must materially affect the score, unlike
// the isolated single-defect case.
// ---------------------------------------------------------------------------
export function severeSystemicDefectSite(pageCount = 10): CrawlEvidence {
  const home = healthyPage({ url: 'https://severesystemic.example/', depth: 0, discovered_via: 'seed', title: 'Severesystemic Co.', meta_description: 'A site where most internal pages are broken.', h1_text: 'Welcome', content_text: RICH_HOME_TEXT })
  const brokenPages = Array.from({ length: pageCount }, (_, i) =>
    makePage({ url: `https://severesystemic.example/broken-${i}`, depth: 1, http_status: 404, title: null, content_text: '', content_word_count: 0, security_evidence: HEALTHY_SECURITY_EVIDENCE })
  )

  const links = brokenPages.map((p) => linkFrom(home, p.url))
  return makeEvidence({ pages: [home, ...brokenPages], links })
}
