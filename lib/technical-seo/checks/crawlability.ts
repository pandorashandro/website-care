import type { CrawlEvidence } from '../evidence'
import type { RawFinding } from '../types'

/**
 * Phase 26, Category A — crawlability / fetch health. Reads only
 * crawl_pages.status/http_status/error_reason/redirect_count, all already
 * persisted by the Phase 25 engine with no additional evidence needed.
 */

const EXCESSIVE_REDIRECT_THRESHOLD = 3

function pathLabel(url: string): string {
  try {
    const { pathname, search } = new URL(url)
    const path = `${pathname}${search}`
    return path === '' ? '/' : path
  } catch {
    return url
  }
}

export function analyzeCrawlability(evidence: CrawlEvidence): RawFinding[] {
  const findings: RawFinding[] = []

  const fetchFailedPages = evidence.pages.filter(
    (page) => page.status === 'failed' && page.error_reason && page.error_reason !== 'redirect_loop' && page.error_reason !== 'too_many_redirects'
  )
  if (fetchFailedPages.length > 0) {
    findings.push({
      checkKey: 'fetch_failed',
      category: 'crawlability',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Pages could not be reached',
      explanation: `webioom could not get a response from ${fetchFailedPages.length} page${fetchFailedPages.length === 1 ? '' : 's'} while crawling your site.`,
      whyItMatters: 'A page search engines and visitors cannot reach cannot rank or convert — this often points to a hosting, DNS, or server configuration problem.',
      recommendation: 'Check that your hosting and DNS are configured correctly and that these URLs respond normally in a browser.',
      evidence: {},
      affectedPages: fetchFailedPages.map((page) => ({ url: page.url, detail: { errorReason: page.error_reason } })),
    })
  }

  const redirectLoopPages = evidence.pages.filter((page) => page.status === 'failed' && page.error_reason === 'redirect_loop')
  if (redirectLoopPages.length > 0) {
    findings.push({
      checkKey: 'redirect_loop_page',
      category: 'crawlability',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Redirect loops detected',
      explanation: `${redirectLoopPages.length} URL${redirectLoopPages.length === 1 ? '' : 's'} redirect${redirectLoopPages.length === 1 ? 's' : ''} back to a URL already seen in the same chain, so webioom (and search engines) can never reach a final page.`,
      whyItMatters: 'A redirect loop means the page can never actually load — it is effectively broken for both users and search engines.',
      recommendation: 'Review your redirect rules for these URLs and fix the chain so it ends on a real, working page.',
      evidence: {},
      affectedPages: redirectLoopPages.map((page) => ({ url: page.url })),
    })
  }

  const excessiveRedirectPages = evidence.pages.filter(
    (page) =>
      (page.status === 'completed' && page.redirect_count >= EXCESSIVE_REDIRECT_THRESHOLD) ||
      (page.status === 'failed' && page.error_reason === 'too_many_redirects')
  )
  if (excessiveRedirectPages.length > 0) {
    findings.push({
      checkKey: 'excessive_redirect_chain',
      category: 'crawlability',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Pages require an excessive number of redirects',
      explanation: `${excessiveRedirectPages.length} URL${excessiveRedirectPages.length === 1 ? '' : 's'} require${excessiveRedirectPages.length === 1 ? 's' : ''} ${EXCESSIVE_REDIRECT_THRESHOLD} or more redirect hops before reaching a final page.`,
      whyItMatters: 'Long redirect chains slow page loading and make it more likely a search engine gives up before reaching the final page.',
      recommendation: 'Update links and redirect rules so these URLs point directly to their final destination in one hop.',
      evidence: {},
      affectedPages: excessiveRedirectPages.map((page) => ({ url: page.url, detail: { redirectCount: page.redirect_count ?? null } })),
    })
  }

  const notFoundPages = evidence.pages.filter((page) => page.status === 'completed' && page.http_status === 404)
  if (notFoundPages.length > 0) {
    findings.push({
      checkKey: 'internal_page_4xx',
      category: 'crawlability',
      scope: 'page',
      baseSeverity: 'high',
      confidence: 'high',
      title: 'Internal pages return a 404 Not Found',
      explanation: `${notFoundPages.length} page${notFoundPages.length === 1 ? '' : 's'} webioom discovered on your site return${notFoundPages.length === 1 ? 's' : ''} an HTTP 404 response.`,
      whyItMatters: 'A page that no longer exists but is still linked to wastes crawl budget and shows visitors a dead end.',
      recommendation: `Restore ${notFoundPages.length === 1 ? 'the page' : 'these pages'}, or update/remove the links pointing to ${notFoundPages.length === 1 ? 'it' : 'them'} and redirect to a relevant working page.`,
      evidence: {},
      affectedPages: notFoundPages.map((page) => ({ url: page.url, detail: { httpStatus: page.http_status, path: pathLabel(page.url) } })),
    })
  }

  const otherClientErrorPages = evidence.pages.filter(
    (page) => page.status === 'completed' && typeof page.http_status === 'number' && page.http_status >= 400 && page.http_status <= 499 && page.http_status !== 404
  )
  if (otherClientErrorPages.length > 0) {
    findings.push({
      checkKey: 'internal_page_4xx',
      category: 'crawlability',
      scope: 'page',
      baseSeverity: 'medium',
      confidence: 'high',
      title: 'Internal pages return a client-error status',
      explanation: `${otherClientErrorPages.length} page${otherClientErrorPages.length === 1 ? '' : 's'} return${otherClientErrorPages.length === 1 ? 's' : ''} a 4xx HTTP status other than 404.`,
      whyItMatters: 'A 4xx response usually means the page is unavailable to visitors and search engines for a reason worth confirming.',
      recommendation: 'Check server or access-control configuration to confirm each of these responses is intentional.',
      evidence: {},
      affectedPages: otherClientErrorPages.map((page) => ({ url: page.url, detail: { httpStatus: page.http_status } })),
    })
  }

  const serverErrorPages = evidence.pages.filter((page) => page.status === 'completed' && typeof page.http_status === 'number' && page.http_status >= 500 && page.http_status <= 599)
  if (serverErrorPages.length > 0) {
    findings.push({
      checkKey: 'internal_page_5xx',
      category: 'crawlability',
      scope: 'page',
      baseSeverity: 'critical',
      confidence: 'high',
      title: 'Internal pages return a server error',
      explanation: `${serverErrorPages.length} page${serverErrorPages.length === 1 ? '' : 's'} returned a 5xx server-error response while webioom was crawling your site.`,
      whyItMatters: 'A server error means the page is currently broken for every visitor and search engine, not just webioom.',
      recommendation: 'Check your server/application logs for these URLs and resolve the underlying error.',
      evidence: {},
      affectedPages: serverErrorPages.map((page) => ({ url: page.url, detail: { httpStatus: page.http_status } })),
    })
  }

  return findings
}
