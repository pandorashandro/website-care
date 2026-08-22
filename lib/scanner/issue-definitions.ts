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
    title: 'Homepage unreachable',
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
} as const satisfies Record<string, IssueDefinition>

export function buildIssue(
  key: keyof typeof ISSUE_DEFINITIONS,
  description: string
): ScanIssue {
  return { ...ISSUE_DEFINITIONS[key], description }
}
