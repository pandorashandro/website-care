export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ScanIssue = {
  type: string
  severity: IssueSeverity
  title: string
  description: string
  recommendation: string
}

type IssueDefinition = Omit<ScanIssue, 'description'>

export const ISSUE_DEFINITIONS = {
  unreachable: {
    type: 'technical',
    severity: 'critical',
    title: 'Page unreachable',
    recommendation:
      'Check that your hosting and DNS are configured correctly and that the site responds to requests.',
  },
  no_https: {
    type: 'technical',
    severity: 'high',
    title: 'Not using HTTPS',
    recommendation: 'Install an SSL certificate and redirect all traffic to HTTPS.',
  },
  missing_title: {
    type: 'seo',
    severity: 'high',
    title: 'Missing page title',
    recommendation: 'Add a descriptive <title> tag to the homepage.',
  },
  missing_meta_description: {
    type: 'seo',
    severity: 'medium',
    title: 'Missing meta description',
    recommendation: 'Add a concise meta description summarizing the page content.',
  },
  missing_h1: {
    type: 'seo',
    severity: 'medium',
    title: 'Missing H1 heading',
    recommendation: 'Add a single, descriptive <h1> heading to the homepage.',
  },
  missing_image_alt: {
    type: 'accessibility',
    severity: 'low',
    title: 'Images missing alt text',
    recommendation: 'Add descriptive alt attributes to all images for screen reader users.',
  },
  title_too_short: {
    type: 'seo',
    severity: 'medium',
    title: 'Page title is too short',
    recommendation:
      'Expand the page title to around 30–60 characters so it fully describes the page.',
  },
  title_too_long: {
    type: 'seo',
    severity: 'medium',
    title: 'Page title is too long',
    recommendation:
      "Shorten the page title to under 60 characters so it doesn't get cut off in search results.",
  },
  meta_description_too_short: {
    type: 'seo',
    severity: 'low',
    title: 'Meta description is too short',
    recommendation:
      'Expand the meta description to roughly 70–160 characters to better summarize the page.',
  },
  meta_description_too_long: {
    type: 'seo',
    severity: 'low',
    title: 'Meta description is too long',
    recommendation:
      "Shorten the meta description to under 160 characters so it isn't cut off in search results.",
  },
  multiple_h1: {
    type: 'seo',
    severity: 'medium',
    title: 'Multiple H1 headings',
    recommendation: 'Use only one <h1> heading per page, and use <h2>/<h3> for subheadings.',
  },
  missing_canonical: {
    type: 'seo',
    severity: 'medium',
    title: 'Missing canonical tag',
    recommendation: 'Add a <link rel="canonical"> tag pointing to the preferred URL for this page.',
  },
  missing_og_title: {
    type: 'seo',
    severity: 'low',
    title: 'Missing Open Graph title',
    recommendation: 'Add an og:title meta tag so the page looks right when shared on social media.',
  },
  missing_og_description: {
    type: 'seo',
    severity: 'low',
    title: 'Missing Open Graph description',
    recommendation: 'Add an og:description meta tag so shared links show a helpful summary.',
  },
  missing_lang_attribute: {
    type: 'accessibility',
    severity: 'low',
    title: 'Missing language attribute',
    recommendation: 'Add a lang attribute (e.g. lang="en") to the <html> tag.',
  },
  slow_response: {
    type: 'performance',
    severity: 'medium',
    title: 'Slow initial response',
    recommendation:
      'Investigate hosting, caching, or server performance to speed up the initial page response.',
  },
  large_html: {
    type: 'performance',
    severity: 'low',
    title: 'Large HTML document',
    recommendation: 'Reduce page weight by trimming unused markup, inline scripts, or embedded content.',
  },
  empty_links: {
    type: 'accessibility',
    severity: 'low',
    title: 'Links with no text',
    recommendation: 'Add visible text or an aria-label to every link so it makes sense to screen readers.',
  },
  empty_buttons: {
    type: 'accessibility',
    severity: 'low',
    title: 'Buttons with no text',
    recommendation: 'Add visible text or an aria-label to every button so its purpose is clear.',
  },
  low_text_content: {
    type: 'content',
    severity: 'medium',
    title: 'Very little visible text',
    recommendation:
      'Add more meaningful content to the page so visitors and search engines understand what it offers.',
  },
} as const satisfies Record<string, IssueDefinition>

export function buildIssue(
  key: keyof typeof ISSUE_DEFINITIONS,
  description: string
): ScanIssue {
  return { ...ISSUE_DEFINITIONS[key], description }
}
