import {
  countH1,
  fetchPage,
  getMetaDescriptionContent,
  getTitleText,
  getVisibleTextLength,
  hasCanonicalTag,
  hasEmptyButtons,
  hasEmptyLinks,
  hasImageMissingAlt,
  hasLangAttribute,
  hasOpenGraphDescription,
  hasOpenGraphTitle,
  isHttps,
} from './checks'
import { buildIssue, type ScanIssue } from './issue-definitions'

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
} as const

const TITLE_MIN_LENGTH = 30
const TITLE_MAX_LENGTH = 60
const META_DESCRIPTION_MIN_LENGTH = 70
const META_DESCRIPTION_MAX_LENGTH = 160
const SLOW_RESPONSE_MS = 3000
const MAX_HTML_BYTES = 1_048_576 // 1 MiB
const MIN_VISIBLE_TEXT_LENGTH = 300

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

/** Fetches and runs every existing check against a single page. */
export async function analyzePage(url: string): Promise<PageScanResult> {
  const issues: ScanIssue[] = []
  let score = 100

  if (!isHttps(url)) {
    issues.push(buildIssue('no_https', 'This page does not use HTTPS.'))
    score -= DEDUCTIONS.noHttps
  }

  const fetched = await fetchPage(url)

  if (!fetched.ok) {
    issues.push(buildIssue('unreachable', 'This page could not be reached.'))
    score -= DEDUCTIONS.unreachable
    return { url, reachable: false, score: clampScore(score), issues, html: null, finalUrl: null }
  }

  const { html, durationMs, sizeBytes, finalUrl } = fetched

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

  if (!hasCanonicalTag(html)) {
    issues.push(buildIssue('missing_canonical', 'This page has no canonical link tag.'))
    score -= DEDUCTIONS.missingCanonical
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
