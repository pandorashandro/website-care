export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ScanIssue = {
  type: string
  severity: IssueSeverity
  title: string
  description: string
  recommendation: string
  /** The exact affected image's public src — set only for missing_image_alt issues, one row per image. Never guessed from filename/index/fuzzy matching. */
  imageUrl?: string
}

type IssueDefinition = Omit<ScanIssue, 'description' | 'imageUrl'>

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
  page_not_found: {
    type: 'technical',
    severity: 'high',
    title: 'Page returns 404',
    recommendation: 'Restore the page or redirect links pointing to it to the most relevant working page.',
  },
  page_gone: {
    type: 'technical',
    severity: 'high',
    title: 'Page returns 410',
    recommendation: 'This page is permanently gone. Set up a 301 redirect to the most relevant working page.',
  },
  page_forbidden: {
    type: 'technical',
    severity: 'medium',
    title: 'Page access forbidden',
    recommendation:
      'Check server or firewall configuration to confirm this page should be blocked, and fix access rules if not.',
  },
  server_error: {
    type: 'technical',
    severity: 'critical',
    title: 'Server error',
    recommendation: 'Check server logs and hosting configuration to resolve the underlying error.',
  },
  page_rate_limited: {
    type: 'technical',
    severity: 'medium',
    title: 'Page is rate limited',
    recommendation:
      'Check rate-limiting or bot-protection settings so legitimate requests to this page are not blocked.',
  },
  unexpected_status: {
    type: 'technical',
    severity: 'medium',
    title: 'Unexpected HTTP status',
    recommendation:
      'Check server logs or hosting configuration to understand why this page returns this status code.',
  },
  too_many_redirects: {
    type: 'technical',
    severity: 'high',
    title: 'Too many redirects',
    recommendation: 'Simplify the redirect chain so this page loads in fewer hops.',
  },
  redirect_loop: {
    type: 'technical',
    severity: 'high',
    title: 'Redirect loop detected',
    recommendation: 'Fix the redirect rules for this URL so it does not redirect back to itself.',
  },
  https_downgrade: {
    type: 'technical',
    severity: 'high',
    title: 'HTTPS redirects to insecure HTTP',
    recommendation: 'Update redirect rules so HTTPS requests never redirect to an insecure HTTP URL.',
  },
  long_redirect_chain: {
    type: 'technical',
    severity: 'low',
    title: 'Long redirect chain',
    recommendation: 'Update links to point directly to the final URL instead of going through multiple redirects.',
  },
  noindex: {
    type: 'seo',
    severity: 'high',
    title: 'Page marked noindex',
    recommendation:
      'Verify that excluding this page from search results is intentional; remove the noindex directive if not.',
  },
  canonical_cross_domain: {
    type: 'seo',
    severity: 'medium',
    title: 'Canonical points to another domain',
    recommendation: "Verify that pointing this page's canonical to a different domain is intentional.",
  },
  canonical_http: {
    type: 'seo',
    severity: 'medium',
    title: 'Canonical uses insecure HTTP',
    recommendation: 'Update the canonical tag to use the HTTPS version of the URL.',
  },
  invalid_canonical: {
    type: 'seo',
    severity: 'medium',
    title: 'Invalid canonical URL',
    recommendation: 'Fix the canonical tag so it points to a valid, absolute http or https URL.',
  },
  robots_not_found: {
    type: 'technical',
    severity: 'low',
    title: 'robots.txt not found',
    recommendation: 'Add a robots.txt file if you need to control crawler access or advertise your sitemap.',
  },
  robots_unreachable: {
    type: 'technical',
    severity: 'medium',
    title: 'robots.txt could not be checked',
    recommendation: 'Verify that /robots.txt is reachable and returns a normal response.',
  },
  robots_blocks_site: {
    type: 'seo',
    severity: 'critical',
    title: 'Search engines may be blocked from the entire site',
    recommendation:
      'Verify that blocking all crawlers is intentional. If the site should appear in search engines, remove the site-wide disallow rule.',
  },
  sitemap_not_found: {
    type: 'seo',
    severity: 'medium',
    title: 'XML sitemap not found',
    recommendation: 'Create and submit an XML sitemap so search engines can discover important pages more reliably.',
  },
  sitemap_unreachable: {
    type: 'technical',
    severity: 'medium',
    title: 'Sitemap could not be checked',
    recommendation: 'Verify the sitemap URL is reachable and returns a normal response.',
  },
  sitemap_invalid: {
    type: 'seo',
    severity: 'medium',
    title: 'Sitemap does not look like a valid XML sitemap',
    recommendation: 'Ensure the sitemap URL serves valid XML sitemap content.',
  },
  sitemap_external_urls: {
    type: 'seo',
    severity: 'low',
    title: 'Sitemap contains external URLs',
    recommendation: 'Remove external URLs from the sitemap so it only lists pages on this site.',
  },
} as const satisfies Record<string, IssueDefinition>

export function buildIssue(
  key: keyof typeof ISSUE_DEFINITIONS,
  description: string,
  imageUrl?: string
): ScanIssue {
  return { ...ISSUE_DEFINITIONS[key], description, ...(imageUrl !== undefined ? { imageUrl } : {}) }
}
