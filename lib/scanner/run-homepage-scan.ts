import {
  fetchHomepage,
  hasH1,
  hasImageMissingAlt,
  hasMetaDescription,
  hasNonEmptyTitle,
  isHttps,
} from './checks'
import { buildIssue, type ScanIssue } from './issue-definitions'

export type { ScanIssue }

export type ScanOutcome = {
  score: number
  issues: ScanIssue[]
}

const DEDUCTIONS = {
  unreachable: 40,
  noHttps: 15,
  missingTitle: 15,
  missingMetaDescription: 10,
  missingH1: 10,
  missingImageAlt: 10,
} as const

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

export async function runHomepageScan(url: string): Promise<ScanOutcome> {
  const issues: ScanIssue[] = []
  let score = 100

  if (!isHttps(url)) {
    issues.push(buildIssue('no_https', 'The homepage does not use HTTPS.'))
    score -= DEDUCTIONS.noHttps
  }

  const fetched = await fetchHomepage(url)

  if (!fetched.ok) {
    issues.push(buildIssue('unreachable', 'The homepage could not be reached.'))
    score -= DEDUCTIONS.unreachable
    return { score: clampScore(score), issues }
  }

  const { html } = fetched

  if (!hasNonEmptyTitle(html)) {
    issues.push(buildIssue('missing_title', 'The homepage is missing a page title.'))
    score -= DEDUCTIONS.missingTitle
  }

  if (!hasMetaDescription(html)) {
    issues.push(
      buildIssue('missing_meta_description', 'The homepage is missing a meta description.')
    )
    score -= DEDUCTIONS.missingMetaDescription
  }

  if (!hasH1(html)) {
    issues.push(buildIssue('missing_h1', 'The homepage is missing an <h1> heading.'))
    score -= DEDUCTIONS.missingH1
  }

  if (hasImageMissingAlt(html)) {
    issues.push(buildIssue('missing_image_alt', 'One or more images are missing alt text.'))
    score -= DEDUCTIONS.missingImageAlt
  }

  return { score: clampScore(score), issues }
}
