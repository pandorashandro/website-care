import {
  countH1,
  fetchPage,
  getCanonicalHref,
  getMetaDescriptionContent,
  getTitleText,
  getVisibleTextLength,
  hasEmptyButtons,
  hasEmptyLinks,
  hasImageMissingAlt,
  hasLangAttribute,
  hasNoindexMetaRobots,
  hasNoindexXRobotsTag,
  hasOpenGraphDescription,
  hasOpenGraphTitle,
  isHttps,
  type FetchFailureReason,
} from './checks'
import { buildIssue, type ScanIssue } from './issue-definitions'
import { normalizeUrl } from './url-utils'

export type PageScanResult = {
  /** The queued/normalized URL — used to identify this page (e.g. as issues.page_url). */
  url: string
  reachable: boolean
  score: number
  issues: ScanIssue[]
  /** Raw HTML, used by the crawler to discover further links. Null if unreachable. */
  html: string | null
  /** The URL actually served, after redirects — used as the base for resolving links on this page. */
  finalUrl: string | null
}

const DEDUCTIONS = {
  unreachable: 40,
  noHttps: 15,
  missingTitle: 15,
  missingMetaDescription: 10,
  missingH1: 10,
  missingImageAlt: 10,
  titleTooShort: 5,
  titleTooLong: 5,
  metaDescriptionTooShort: 3,
  metaDescriptionTooLong: 3,
  multipleH1: 5,
  missingCanonical: 5,
  missingOgTitle: 2,
  missingOgDescription: 2,
  missingLangAttribute: 2,
  slowResponse: 8,
  largeHtml: 3,
  emptyLinks: 3,
  emptyButtons: 3,
  lowTextContent: 8,
  // Phase 12.5A: HTTP status / redirect / indexability / canonical diagnostics
  notFound: 20,
  gone: 20,
  forbidden: 10,
  serverError: 30,
  rateLimited: 10,
  unexpectedStatus: 10,
  tooManyRedirects: 15,
  redirectLoop: 15,
  httpsDowngrade: 15,
  longRedirectChain: 3,
  noindex: 15,
  canonicalCrossDomain: 5,
  canonicalHttp: 5,
  invalidCanonical: 8,
} as const

const TITLE_MIN_LENGTH = 30
const TITLE_MAX_LENGTH = 60
const META_DESCRIPTION_MIN_LENGTH = 70
const META_DESCRIPTION_MAX_LENGTH = 160
const SLOW_RESPONSE_MS = 3000
const MAX_HTML_BYTES = 1_048_576 // 1 MiB
const MIN_VISIBLE_TEXT_LENGTH = 300
const LONG_REDIRECT_CHAIN_THRESHOLD = 3

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

/**
 * Maps a network-level fetch failure (no HTTP response obtained at all) to
 * an issue. Timeout/blocked/network all stay the generic "unreachable"
 * issue — only the description varies — since none of them produced a real
 * response to diagnose further. Too-many-redirects and a detected redirect
 * loop get their own specific issues per spec.
 */
function buildFetchFailureIssue(reason: FetchFailureReason): {
  issue: ScanIssue
  deduction: number
} {
  switch (reason) {
    case 'timeout':
      return {
        issue: buildIssue('unreachable', 'This page did not respond in time (timed out).'),
        deduction: DEDUCTIONS.unreachable,
      }
    case 'blocked':
      return {
        issue: buildIssue(
          'unreachable',
          'This page could not be reached because it points to a blocked or unsafe address.'
        ),
        deduction: DEDUCTIONS.unreachable,
      }
    case 'too_many_redirects':
      return {
        issue: buildIssue(
          'too_many_redirects',
          'This page could not be reached because it followed more redirects than allowed.'
        ),
        deduction: DEDUCTIONS.tooManyRedirects,
      }
    case 'redirect_loop':
      return {
        issue: buildIssue(
          'redirect_loop',
          'This page could not be reached because it entered a redirect loop.'
        ),
        deduction: DEDUCTIONS.redirectLoop,
      }
    case 'network':
    default:
      return {
        issue: buildIssue('unreachable', 'This page could not be reached due to a network error.'),
        deduction: DEDUCTIONS.unreachable,
      }
  }
}

/**
 * Maps a real (non-2xx) HTTP response status to a specific issue, instead of
 * a generic "unreachable" one — the response did arrive, it just wasn't a
 * success.
 */
function buildStatusIssue(status: number): { issue: ScanIssue; deduction: number } {
  if (status === 404) {
    return {
      issue: buildIssue('page_not_found', `This page returns an HTTP ${status} Not Found response.`),
      deduction: DEDUCTIONS.notFound,
    }
  }

  if (status === 410) {
    return {
      issue: buildIssue('page_gone', `This page returns an HTTP ${status} Gone response.`),
      deduction: DEDUCTIONS.gone,
    }
  }

  if (status === 403) {
    return {
      issue: buildIssue('page_forbidden', `This page returns an HTTP ${status} Forbidden response.`),
      deduction: DEDUCTIONS.forbidden,
    }
  }

  if (status === 429) {
    return {
      issue: buildIssue(
        'page_rate_limited',
        `This page returns an HTTP ${status} Too Many Requests response.`
      ),
      deduction: DEDUCTIONS.rateLimited,
    }
  }

  if (status >= 500 && status <= 599) {
    return {
      issue: buildIssue('server_error', `This page returns an HTTP ${status} server error response.`),
      deduction: DEDUCTIONS.serverError,
    }
  }

  return {
    issue: buildIssue('unexpected_status', `This page returns an unexpected HTTP ${status} response.`),
    deduction: DEDUCTIONS.unexpectedStatus,
  }
}

/** Fetches and runs every existing check against a single page. */
export async function analyzePage(url: string): Promise<PageScanResult> {
  const issues: ScanIssue[] = []
  let score = 100

  const requestedHttps = isHttps(url)
  if (!requestedHttps) {
    issues.push(buildIssue('no_https', 'This page does not use HTTPS.'))
    score -= DEDUCTIONS.noHttps
  }

  const fetched = await fetchPage(url)

  if (!fetched.ok) {
    const { issue, deduction } = buildFetchFailureIssue(fetched.reason)
    issues.push(issue)
    score -= deduction
    return { url, reachable: false, score: clampScore(score), issues, html: null, finalUrl: null }
  }

  const { html, durationMs, sizeBytes, finalUrl, finalStatus, redirectCount, xRobotsTag } = fetched

  // Redirect diagnostics apply regardless of the final status — a page can
  // have both a too-long redirect chain AND land on a broken destination.
  if (redirectCount >= LONG_REDIRECT_CHAIN_THRESHOLD) {
    issues.push(
      buildIssue(
        'long_redirect_chain',
        `This page required ${redirectCount} redirects before loading.`
      )
    )
    score -= DEDUCTIONS.longRedirectChain
  }

  if (requestedHttps && new URL(finalUrl).protocol === 'http:') {
    issues.push(
      buildIssue(
        'https_downgrade',
        'This page starts on HTTPS but a redirect sends it to an insecure HTTP URL.'
      )
    )
    score -= DEDUCTIONS.httpsDowngrade
  }

  if (finalStatus < 200 || finalStatus >= 300) {
    const { issue, deduction } = buildStatusIssue(finalStatus)
    issues.push(issue)
    score -= deduction
    return { url, reachable: true, score: clampScore(score), issues, html, finalUrl }
  }

  const titleText = getTitleText(html)
  if (!titleText) {
    issues.push(buildIssue('missing_title', 'This page is missing a page title.'))
    score -= DEDUCTIONS.missingTitle
  } else if (titleText.length < TITLE_MIN_LENGTH) {
    issues.push(
      buildIssue(
        'title_too_short',
        `The page title is only ${titleText.length} characters, which is too short to describe the page well.`
      )
    )
    score -= DEDUCTIONS.titleTooShort
  } else if (titleText.length > TITLE_MAX_LENGTH) {
    issues.push(
      buildIssue(
        'title_too_long',
        `The page title is ${titleText.length} characters, which may get cut off in search results.`
      )
    )
    score -= DEDUCTIONS.titleTooLong
  }

  const metaDescription = getMetaDescriptionContent(html)
  if (!metaDescription) {
    issues.push(
      buildIssue('missing_meta_description', 'This page is missing a meta description.')
    )
    score -= DEDUCTIONS.missingMetaDescription
  } else if (metaDescription.length < META_DESCRIPTION_MIN_LENGTH) {
    issues.push(
      buildIssue(
        'meta_description_too_short',
        `The meta description is only ${metaDescription.length} characters, which is too brief for search results.`
      )
    )
    score -= DEDUCTIONS.metaDescriptionTooShort
  } else if (metaDescription.length > META_DESCRIPTION_MAX_LENGTH) {
    issues.push(
      buildIssue(
        'meta_description_too_long',
        `The meta description is ${metaDescription.length} characters, which may get cut off in search results.`
      )
    )
    score -= DEDUCTIONS.metaDescriptionTooLong
  }

  const h1Count = countH1(html)
  if (h1Count === 0) {
    issues.push(buildIssue('missing_h1', 'This page is missing an <h1> heading.'))
    score -= DEDUCTIONS.missingH1
  } else if (h1Count > 1) {
    issues.push(
      buildIssue(
        'multiple_h1',
        `This page has ${h1Count} <h1> headings, which can confuse search engines about the main topic.`
      )
    )
    score -= DEDUCTIONS.multipleH1
  }

  if (hasImageMissingAlt(html)) {
    issues.push(buildIssue('missing_image_alt', 'One or more images are missing alt text.'))
    score -= DEDUCTIONS.missingImageAlt
  }

  const canonicalHref = getCanonicalHref(html)
  if (!canonicalHref) {
    issues.push(buildIssue('missing_canonical', 'This page has no canonical link tag.'))
    score -= DEDUCTIONS.missingCanonical
  } else {
    const resolvedCanonical = normalizeUrl(canonicalHref, finalUrl)
    if (!resolvedCanonical) {
      issues.push(
        buildIssue(
          'invalid_canonical',
          `This page's canonical tag ("${canonicalHref}") does not resolve to a valid http or https URL.`
        )
      )
      score -= DEDUCTIONS.invalidCanonical
    } else {
      const canonicalUrl = new URL(resolvedCanonical)
      const pageUrl = new URL(finalUrl)

      if (canonicalUrl.hostname.toLowerCase() !== pageUrl.hostname.toLowerCase()) {
        issues.push(
          buildIssue(
            'canonical_cross_domain',
            `This page's canonical tag points to a different domain (${canonicalUrl.hostname}).`
          )
        )
        score -= DEDUCTIONS.canonicalCrossDomain
      }

      if (canonicalUrl.protocol === 'http:' && pageUrl.protocol === 'https:') {
        issues.push(
          buildIssue(
            'canonical_http',
            "This page is served over HTTPS but its canonical tag points to an insecure HTTP URL."
          )
        )
        score -= DEDUCTIONS.canonicalHttp
      }
    }
  }

  if (!hasOpenGraphTitle(html)) {
    issues.push(buildIssue('missing_og_title', 'This page is missing an Open Graph title tag.'))
    score -= DEDUCTIONS.missingOgTitle
  }

  if (!hasOpenGraphDescription(html)) {
    issues.push(
      buildIssue('missing_og_description', 'This page is missing an Open Graph description tag.')
    )
    score -= DEDUCTIONS.missingOgDescription
  }

  if (!hasLangAttribute(html)) {
    issues.push(buildIssue('missing_lang_attribute', 'The <html> tag has no lang attribute.'))
    score -= DEDUCTIONS.missingLangAttribute
  }

  if (hasNoindexMetaRobots(html) || hasNoindexXRobotsTag(xRobotsTag)) {
    issues.push(
      buildIssue(
        'noindex',
        'This page instructs search engines not to index it (noindex). Verify this exclusion is intentional — if the page should appear in search results, remove the noindex directive.'
      )
    )
    score -= DEDUCTIONS.noindex
  }

  if (durationMs > SLOW_RESPONSE_MS) {
    issues.push(
      buildIssue(
        'slow_response',
        `This page took about ${(durationMs / 1000).toFixed(1)}s to respond, which is slower than recommended.`
      )
    )
    score -= DEDUCTIONS.slowResponse
  }

  if (sizeBytes > MAX_HTML_BYTES) {
    issues.push(
      buildIssue(
        'large_html',
        `This page's HTML is about ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB, which is larger than recommended.`
      )
    )
    score -= DEDUCTIONS.largeHtml
  }

  if (hasEmptyLinks(html)) {
    issues.push(buildIssue('empty_links', 'One or more links have no visible text or label.'))
    score -= DEDUCTIONS.emptyLinks
  }

  if (hasEmptyButtons(html)) {
    issues.push(buildIssue('empty_buttons', 'One or more buttons have no visible text or label.'))
    score -= DEDUCTIONS.emptyButtons
  }

  const visibleTextLength = getVisibleTextLength(html)
  if (visibleTextLength < MIN_VISIBLE_TEXT_LENGTH) {
    issues.push(
      buildIssue(
        'low_text_content',
        `This page has only about ${visibleTextLength} characters of visible text, which may look thin to visitors and search engines.`
      )
    )
    score -= DEDUCTIONS.lowTextContent
  }

  return { url, reachable: true, score: clampScore(score), issues, html, finalUrl }
}
