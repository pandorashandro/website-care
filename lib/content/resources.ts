/**
 * Small, hand-written content foundation for the public Resources section
 * (Phase 18.3). Deliberately just three genuinely useful pieces rather than
 * a fabricated blog archive — each one ties directly to a real scanner check
 * (see lib/scanner/issue-definitions.ts) so nothing here describes a
 * capability Website Care doesn't actually have.
 */

export type Resource = {
  slug: string
  title: string
  summary: string
  category: string
  body: string[]
  ctaLabel: string
  ctaHref: string
}

export const RESOURCES: Resource[] = [
  {
    slug: 'website-health-score',
    title: 'What is a website health score?',
    summary:
      'A single number can only tell you so much. Here is what actually goes into a Website Care health score.',
    category: 'Website Health',
    body: [
      'A website health score is a snapshot, taken from your most recent scan, of how many issues Website Care found and how serious they are. It is not a permanent grade — rescanning after you make changes produces a fresh score based on the site as it exists right now.',
      'On its own, a single overall number can hide more than it reveals. A site could score reasonably well overall while having a serious accessibility problem, or vice versa. That is why Website Care also breaks health down into five categories — SEO, Technical, Accessibility, Performance, and Content — each with its own score, so you can see exactly where a website is strong and where it needs attention.',
      'Within each category, individual issues carry a severity — critical, high, medium, or low — based on how much impact that specific problem tends to have. A missing page title and an overly long meta description are both real issues, but they are not equally urgent, and the score reflects that difference rather than treating every issue the same.',
      'The goal of the score is not to be a vanity metric. It exists to give you a fast, honest read on where a website stands, so you can decide what to look at first.',
    ],
    ctaLabel: 'Scan your website',
    ctaHref: '/signup',
  },
  {
    slug: 'why-meta-descriptions-matter',
    title: 'Why missing meta descriptions matter',
    summary: 'The short summary under your listing in search results is not automatic — and it is easy to overlook.',
    category: 'SEO',
    body: [
      'A meta description is the short paragraph of text that often appears under your page\'s title in search results. It does not directly affect search rankings, but it is usually the deciding factor in whether someone actually clicks your result instead of a competitor\'s.',
      'When a page has no meta description, search engines generate one automatically by pulling text from somewhere on the page. That auto-generated snippet is frequently awkward, out of context, or unrelated to what actually makes the page worth visiting — because it was never written to summarize anything, it was just the first text the algorithm found.',
      'Length matters too. A meta description that is too short does not give searchers enough reason to click, and one that is too long gets cut off mid-sentence in the results, which can look unfinished or confusing. Website Care checks for both missing and mis-sized meta descriptions, and for supported pages can prepare a well-sized replacement for your review.',
      'Writing (or fixing) a meta description takes a few minutes, but it directly shapes the first impression your page makes before anyone has even visited it.',
    ],
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
  {
    slug: 'why-image-alt-text-matters',
    title: 'Why image alt text matters',
    summary: 'Alt text is not a technical formality — it is how a meaningful part of your audience experiences your images at all.',
    category: 'Accessibility',
    body: [
      'Alt text is a short written description attached to an image, meant to convey what the image shows to someone who cannot see it. Screen reader software reads that description aloud, which means alt text is often the only way a blind or low-vision visitor knows an image is there at all, let alone what it depicts.',
      'It also matters in more everyday situations: if an image fails to load — a slow connection, a broken file path, a typo in the source — the alt text is what displays in its place, so the page still makes sense instead of showing a blank gap.',
      'Missing alt text is one of the most common accessibility issues Website Care finds, and it is also one of the most overlooked, because a page with missing alt text still looks completely normal to a sighted visitor with images loading correctly. The problem is invisible unless you are specifically checking for it.',
      'For supported images, Website Care can prepare an AI-assisted description based on the image\'s context on the page, which you review before anything is applied to your site.',
    ],
    ctaLabel: 'Check your website',
    ctaHref: '/signup',
  },
]

export function getResourceBySlug(slug: string): Resource | undefined {
  return RESOURCES.find((resource) => resource.slug === slug)
}
