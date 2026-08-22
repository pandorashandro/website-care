import { fetchPage } from './checks'
import { buildIssue, type ScanIssue } from './issue-definitions'

export type RobotsCheckResult = {
  issues: ScanIssue[]
  sitemapUrls: string[]
}

const SITEMAP_DIRECTIVE_PATTERN = /^sitemap\s*:\s*(.+)$/i
const USER_AGENT_PATTERN = /^user-agent\s*:\s*(.+)$/i
const DISALLOW_PATTERN = /^disallow\s*:\s*(.*)$/i

/**
 * Lightweight line-based robots.txt parser — not spec-complete. It tracks
 * only the most recently seen `User-agent:` line as "the active group,"
 * so it will miss the rarer pattern of multiple consecutive `User-agent:`
 * lines sharing one set of rules. Good enough to catch the common
 * `User-agent: *` / `Disallow: /` site-wide block, which is what this
 * check exists for.
 */
function parseRobotsTxt(content: string): { sitewideDisallowAll: boolean; sitemapUrls: string[] } {
  const sitemapUrls: string[] = []
  let currentGroupIsWildcard = false
  let sitewideDisallowAll = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue

    const sitemapMatch = line.match(SITEMAP_DIRECTIVE_PATTERN)
    if (sitemapMatch) {
      sitemapUrls.push(sitemapMatch[1].trim())
      continue
    }

    const userAgentMatch = line.match(USER_AGENT_PATTERN)
    if (userAgentMatch) {
      currentGroupIsWildcard = userAgentMatch[1].trim() === '*'
      continue
    }

    const disallowMatch = line.match(DISALLOW_PATTERN)
    if (disallowMatch && currentGroupIsWildcard && disallowMatch[1].trim() === '/') {
      sitewideDisallowAll = true
    }
  }

  return { sitewideDisallowAll, sitemapUrls }
}

/**
 * Fetches and analyzes /robots.txt for the given website. Returns any
 * diagnostic issues plus any Sitemap: URLs it declared, for check-sitemap.ts
 * to use as discovery candidates.
 */
export async function checkRobots(websiteUrl: string): Promise<RobotsCheckResult> {
  const origin = new URL(websiteUrl).origin
  const robotsUrl = `${origin}/robots.txt`

  const result = await fetchPage(robotsUrl)

  if (!result.ok) {
    return {
      issues: [
        buildIssue(
          'robots_unreachable',
          'Website Care could not fetch robots.txt to check crawler access rules.'
        ),
      ],
      sitemapUrls: [],
    }
  }

  if (result.finalStatus === 404 || result.finalStatus === 410) {
    return {
      issues: [
        buildIssue(
          'robots_not_found',
          'The website does not have a robots.txt file at the standard location.'
        ),
      ],
      sitemapUrls: [],
    }
  }

  if (result.finalStatus < 200 || result.finalStatus >= 300) {
    return {
      issues: [
        buildIssue(
          'robots_unreachable',
          `robots.txt returned an unexpected HTTP ${result.finalStatus} response.`
        ),
      ],
      sitemapUrls: [],
    }
  }

  const { sitewideDisallowAll, sitemapUrls } = parseRobotsTxt(result.html)

  const issues: ScanIssue[] = []

  if (sitewideDisallowAll) {
    issues.push(
      buildIssue(
        'robots_blocks_site',
        'robots.txt contains a rule (User-agent: * with Disallow: /) that blocks all crawlers from the entire site.'
      )
    )
  }

  return { issues, sitemapUrls }
}
