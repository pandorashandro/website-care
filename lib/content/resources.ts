/**
 * Small, hand-written content foundation for the public Resources section
 * (originally Phase 18.3, expanded in Phase 18.6). Deliberately a short list
 * of genuinely useful guides rather than a fabricated blog archive — every
 * topic ties to a real scanner check (see lib/scanner/issue-definitions.ts)
 * or real report behavior (lib/scanner/aggregate-issues.ts,
 * calculate-health-score.ts), so nothing here describes a capability Website
 * Care doesn't actually have. No authors, publish dates, or update dates are
 * tracked anywhere in the app, so none are invented here either.
 *
 * Adding another resource later only requires adding one more entry to
 * RESOURCES below — the landing page and article template both render
 * entirely from this data, with no per-resource page-shell code to
 * duplicate.
 */

export const RESOURCE_CATEGORIES = ['Website Health', 'SEO', 'Technical', 'Accessibility', 'Performance', 'Content'] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

export type ResourceBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; text: string }

export type Resource = {
  slug: string
  title: string
  /** Card preview text and meta description — one or two sentences. */
  summary: string
  /** Short introductory paragraph shown at the top of the article, before the body. */
  intro: string
  category: ResourceCategory
  body: ResourceBlock[]
  /**
   * A short, honest paragraph connecting the topic to what Website Care
   * actually does. For the four complete fix families this may truthfully
   * describe a supported fix workflow; for everything else it describes
   * detection/recommendation only — never implying automatic fixing that
   * doesn't exist.
   */
  productConnection: string
  ctaLabel: string
  ctaHref: string
  /** Shown in the landing page's Featured section. */
  featured?: boolean
  /** Explicit related-resource slugs. Falls back to same-category resources (excluding this one) when omitted — see getRelatedResources. */
  relatedSlugs?: string[]
}

export const RESOURCES: Resource[] = [
  {
    slug: 'website-health-score',
    title: 'What is a website health score?',
    summary: 'A single number can only tell you so much. Here is what actually goes into a Website Care health score.',
    intro: 'A health score is meant to answer one question fast: how is this website actually doing right now? Here is what actually goes into it.',
    category: 'Website Health',
    featured: true,
    relatedSlugs: ['understanding-severity-and-priority', 'why-page-titles-matter', 'why-image-alt-text-matters'],
    body: [
      {
        type: 'paragraph',
        text: 'A website health score is a snapshot, taken from your most recent scan, of how many issues Website Care found and how serious they are. It is not a permanent grade — rescanning after you make changes produces a fresh score based on the site as it exists right now.',
      },
      { type: 'heading', text: 'One number, five categories' },
      {
        type: 'paragraph',
        text: 'On its own, a single overall number can hide more than it reveals. A site could score reasonably well overall while having a serious accessibility problem, or vice versa. That is why Website Care also breaks health down into five categories — SEO, Technical, Accessibility, Performance, and Content — each with its own score, so you can see exactly where a website is strong and where it needs attention.',
      },
      { type: 'heading', text: 'Not every issue counts the same' },
      {
        type: 'paragraph',
        text: 'Within each category, individual issues carry a severity — critical, high, medium, or low — based on how much impact that specific problem tends to have. A missing page title and an overly long meta description are both real issues, but they are not equally urgent, and the score reflects that difference rather than treating every issue the same.',
      },
      {
        type: 'callout',
        text: 'The score is a snapshot of your latest scan, not a permanent grade — rescanning after changes produces a fresh result.',
      },
    ],
    productConnection:
      'Every Website Care report includes an overall score plus a score for each of the five categories, calculated fresh on every scan.',
    ctaLabel: 'Scan your website',
    ctaHref: '/signup',
  },
  {
    slug: 'understanding-severity-and-priority',
    title: 'Severity vs. priority: what’s the difference?',
    summary: 'Two issues can be the same "kind" of problem and still deserve very different amounts of attention.',
    intro: 'Two issues can be the same "kind" of problem and still deserve very different amounts of attention. Here is how Website Care tells them apart.',
    category: 'Website Health',
    body: [
      {
        type: 'paragraph',
        text: 'Severity describes how serious a kind of issue generally is. It is a fixed property of the issue type itself — a missing H1 heading is always a medium-severity SEO issue, and a page returning a server error is always a critical technical issue, regardless of which specific page it happens on.',
      },
      { type: 'heading', text: 'Severity isn’t the whole story' },
      {
        type: 'paragraph',
        text: 'Priority is different: it is how strongly Website Care recommends acting on one specific finding right now, relative to everything else in the report. Priority takes severity into account, but also how widely the issue is spread — how many pages it affects, and whether one of them is your homepage.',
      },
      {
        type: 'callout',
        text: 'A medium-severity issue on one rarely-visited page and the same medium-severity issue across your homepage and eleven other pages are not equally urgent. Priority is what tells them apart; severity alone can’t.',
      },
      { type: 'heading', text: 'Why the distinction matters' },
      {
        type: 'paragraph',
        text: 'Reading severity in isolation risks over-reacting to a rare edge case or under-reacting to something small but everywhere. Priority exists specifically to answer the practical question a severity label alone can’t: out of everything in this report, what should I actually look at first?',
      },
    ],
    productConnection:
      'Every Website Care report ranks findings by priority, not just severity, and highlights the top few as “Fix These First” so you always know where to start.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'why-page-titles-matter',
    title: 'Why page titles matter',
    summary: 'A page title is one of the first things a search engine — and a searcher — ever sees.',
    intro: 'A page title is one of the first things a search engine — and a searcher — ever sees. Getting it wrong costs clicks you never realize you lost.',
    category: 'SEO',
    featured: true,
    body: [
      {
        type: 'paragraph',
        text: 'A page title is the text defined by a page’s <title> tag. It shows up in three places at once: the browser tab, the bold headline of your result in search listings, and the preview when a link is shared. Most visitors judge a search result by its title before they read anything else.',
      },
      { type: 'heading', text: 'What goes wrong' },
      {
        type: 'paragraph',
        text: 'A page can be missing a title entirely, which leaves search engines to guess at a headline on your behalf. A title can also be too short to say anything meaningful, or too long, in which case search engines cut it off mid-sentence in the results.',
      },
      {
        type: 'list',
        items: [
          'Describes the specific page, not just the site name',
          'Stays roughly 30–60 characters so it isn’t cut off in search results',
          'Puts the most important words first',
        ],
      },
      {
        type: 'callout',
        text: 'A title that’s too long doesn’t just look cut off — it can quietly signal to a visitor that a page isn’t quite finished.',
      },
    ],
    productConnection:
      'Website Care checks every page for a missing, too-short, or too-long title, and for supported pages can prepare a replacement — often AI-assisted, based on the page’s own content — for your review.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'what-does-an-h1-heading-do',
    title: 'What does an H1 heading actually do?',
    summary: 'Every page should have one clear heading that says what it’s about — and it’s easy to get wrong.',
    intro: 'Every page should have one clear heading that says what it’s about. When that’s missing — or duplicated — both visitors and search engines lose an important signal.',
    category: 'SEO',
    body: [
      {
        type: 'paragraph',
        text: 'An H1 is a page’s main heading — the large, prominent line a visitor actually reads at the top of the content. It is a different thing from the page title: the title is what shows in a browser tab and search result headline, while the H1 is what appears on the page itself.',
      },
      { type: 'heading', text: 'Two ways this goes wrong' },
      {
        type: 'paragraph',
        text: 'A page can have no H1 at all, leaving both visitors and search engines without a clear statement of what the page is about. Less commonly, a page ends up with more than one H1, which muddies which heading is actually the main one.',
      },
      {
        type: 'callout',
        text: 'A missing H1 and a missing page title are easy to confuse, but they serve different purposes and are checked separately.',
      },
    ],
    productConnection:
      'Website Care detects pages with a missing H1 and, for supported pages, can prepare a fitting heading for your review. Pages with more than one H1 are flagged with a clear explanation, since deciding which heading to keep is a judgment call Website Care leaves to you.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'why-image-alt-text-matters',
    title: 'Why image alt text matters',
    summary: 'Alt text is not a technical formality — it is how a meaningful part of your audience experiences your images at all.',
    intro: 'Alt text is not a technical formality — it is how a meaningful part of your audience experiences your images at all.',
    category: 'Accessibility',
    featured: true,
    body: [
      {
        type: 'paragraph',
        text: 'Alt text is a short written description attached to an image, meant to convey what the image shows to someone who cannot see it. Screen reader software reads that description aloud, which makes it often the only way a blind or low-vision visitor knows an image is there at all, let alone what it depicts.',
      },
      { type: 'heading', text: 'It’s not only about screen readers' },
      {
        type: 'paragraph',
        text: 'Alt text matters in more everyday situations too: if an image fails to load — a slow connection, a broken file path, a typo in the source — the alt text is what displays in its place, so the page still makes sense instead of showing a blank gap.',
      },
      {
        type: 'callout',
        text: 'Missing alt text is invisible to a sighted visitor with images loading normally, which is exactly why it’s one of the most commonly overlooked issues Website Care finds.',
      },
    ],
    productConnection:
      'Website Care identifies images missing alt text and, for supported cases, can prepare an AI-assisted description for your review before anything is applied.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'why-meta-descriptions-matter',
    title: 'Why missing meta descriptions matter',
    summary: 'The short summary under your listing in search results is not automatic — and it is easy to overlook.',
    intro: 'The short summary that appears under your listing in search results is not automatic. Leaving it blank hands that decision to an algorithm.',
    category: 'SEO',
    relatedSlugs: ['why-page-titles-matter', 'what-does-an-h1-heading-do'],
    body: [
      {
        type: 'paragraph',
        text: 'A meta description is the short paragraph of text that often appears under your page’s title in search results. It does not directly affect search rankings, but it is usually the deciding factor in whether someone actually clicks your result instead of a competitor’s.',
      },
      { type: 'heading', text: 'What happens when it’s missing' },
      {
        type: 'paragraph',
        text: 'When a page has no meta description, search engines generate one automatically by pulling text from somewhere on the page. That auto-generated snippet is frequently awkward, out of context, or unrelated to what actually makes the page worth visiting, because it was never written to summarize anything — it was just the first text the algorithm found.',
      },
      { type: 'heading', text: 'Length matters too' },
      {
        type: 'list',
        items: [
          'Summarizes the specific page, not the whole site',
          'Stays roughly 70–160 characters so it isn’t cut off in the results',
          'Gives someone a reason to click, not just a description',
        ],
      },
    ],
    productConnection:
      'Website Care checks for missing meta descriptions as well as ones that are too short or too long, and for supported pages can prepare a well-sized replacement for your review.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'what-makes-a-website-technically-healthy',
    title: 'What makes a website technically healthy?',
    summary: 'Nothing else about a website matters if its pages aren’t reliably reachable.',
    intro: 'Nothing else about a website matters if pages aren’t reliably reachable. Technical health is the foundation everything else stands on.',
    category: 'Technical',
    body: [
      {
        type: 'paragraph',
        text: 'Technical health is about whether your site is dependably accessible to visitors and search engines — not visual polish or content quality, which are their own separate categories.',
      },
      { type: 'heading', text: 'What Website Care checks for' },
      {
        type: 'list',
        items: [
          'Whether pages are reachable at all, or return a server error or a 404',
          'Whether your site uses HTTPS — and whether HTTPS accidentally redirects back to an insecure address',
          'Redirect chains and redirect loops that slow pages down or confuse crawlers',
          'Internal links that point to broken, missing, or redirecting pages',
          'Whether your robots.txt file and sitemap are reachable',
        ],
      },
      {
        type: 'callout',
        text: 'These problems are often invisible day to day — a redirect loop or a broken internal link rarely announces itself. That’s exactly why systematic checking matters.',
      },
    ],
    productConnection:
      'Technical findings come with a clear description and recommendation, but most require a hosting, DNS, or server-level change only you or your host can make safely — they aren’t part of Website Care’s current direct-fix workflows.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'why-slow-pages-lose-visitors',
    title: 'Why slow pages lose visitors',
    summary: 'A slow page loses visitors before they ever see what’s on it.',
    intro: 'A slow page loses visitors before they ever see what’s on it. Performance is one of the most measurable things about a website — and one of the easiest to ignore.',
    category: 'Performance',
    body: [
      {
        type: 'paragraph',
        text: 'How quickly a page responds and how much unnecessary weight it carries directly shapes whether a visitor sticks around long enough to see it. Nobody consciously waits for a slow page — they just leave.',
      },
      { type: 'heading', text: 'What Website Care looks at' },
      {
        type: 'paragraph',
        text: 'Website Care checks how quickly a page returns its initial response, and flags HTML documents that are unusually large — a sign of unused markup, excessive inline content, or bloated embedded scripts weighing a page down.',
      },
      {
        type: 'callout',
        text: 'Performance problems compound: a slow homepage doesn’t just cost that one visit — it colors every page a visitor was about to explore next.',
      },
    ],
    productConnection:
      'Slow-response and page-weight findings come with a specific recommendation, but like other technical issues, they currently require action outside Website Care’s direct-fix workflows — most trace back to hosting, caching, or how a page is built.',
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
]

export function getResourceBySlug(slug: string): Resource | undefined {
  return RESOURCES.find((resource) => resource.slug === slug)
}

/** Categories that actually have at least one resource, in RESOURCE_CATEGORIES order — never a category with zero content. */
export function getUsedCategories(): ResourceCategory[] {
  const present = new Set(RESOURCES.map((resource) => resource.category))
  return RESOURCE_CATEGORIES.filter((category) => present.has(category))
}

export function getResourcesByCategory(category: ResourceCategory): Resource[] {
  return RESOURCES.filter((resource) => resource.category === category)
}

/**
 * Explicit relatedSlugs when present (self-references filtered out
 * defensively); otherwise falls back to other resources in the same
 * category. No recommendation algorithm — just a simple, predictable rule.
 */
export function getRelatedResources(slug: string, limit = 3): Resource[] {
  const current = getResourceBySlug(slug)
  if (!current) return []

  if (current.relatedSlugs && current.relatedSlugs.length > 0) {
    const explicit = current.relatedSlugs
      .filter((relatedSlug) => relatedSlug !== slug)
      .map((relatedSlug) => getResourceBySlug(relatedSlug))
      .filter((resource): resource is Resource => !!resource)

    if (explicit.length > 0) return explicit.slice(0, limit)
  }

  return RESOURCES.filter((resource) => resource.slug !== slug && resource.category === current.category).slice(0, limit)
}
