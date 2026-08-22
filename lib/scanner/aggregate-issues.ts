import { normalizeUrl } from './url-utils'

export type RawIssueRow = {
  page_url: string | null
  type: string
  severity: string
  title: string
  description: string
  recommendation: string
}

export type PriorityLabel = 'Urgent' | 'High Priority' | 'Medium Priority' | 'Low Priority'

export type AggregatedIssue = {
  title: string
  type: string
  severity: string
  description: string
  recommendation: string
  affectedPageUrls: string[]
  affectedPageCount: number
  homepageAffected: boolean
  priorityScore: number
  priorityLabel: PriorityLabel
}

const SEVERITY_BASE_POINTS: Record<string, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
}

const HOMEPAGE_BONUS = 20
const PER_EXTRA_PAGE_BONUS = 5
const MAX_PAGE_COUNT_BONUS = 25

function calculatePriorityScore(
  severity: string,
  homepageAffected: boolean,
  affectedPageCount: number
): number {
  const base = SEVERITY_BASE_POINTS[severity] ?? 0
  const homepageBonus = homepageAffected ? HOMEPAGE_BONUS : 0
  const pageCountBonus = Math.min(
    MAX_PAGE_COUNT_BONUS,
    Math.max(0, affectedPageCount - 1) * PER_EXTRA_PAGE_BONUS
  )

  return base + homepageBonus + pageCountBonus
}

function priorityLabelFor(score: number): PriorityLabel {
  if (score >= 100) return 'Urgent'
  if (score >= 70) return 'High Priority'
  if (score >= 40) return 'Medium Priority'
  return 'Low Priority'
}

type GroupAccumulator = {
  title: string
  type: string
  severity: string
  description: string
  recommendation: string
  pageUrls: Set<string>
  homepageAffected: boolean
}

/**
 * Groups raw issue rows from a single scan into one entry per distinct
 * (title, type, severity) check, deduplicating affected pages and computing
 * a deterministic priority score for ranking.
 *
 * Pure and order-independent: input rows are sorted internally before
 * grouping, so the result never depends on database row order. A null
 * page_url (a pre-migration row, created before this column existed) is
 * treated as the homepage, since every such row came from a homepage-only
 * scan.
 */
export function aggregateIssues(rawIssues: RawIssueRow[], websiteUrl: string): AggregatedIssue[] {
  const normalizedHomepage = normalizeUrl(websiteUrl, websiteUrl)

  function resolvePageUrl(pageUrl: string | null): string {
    if (!pageUrl) return normalizedHomepage ?? websiteUrl
    return normalizeUrl(pageUrl, websiteUrl) ?? pageUrl
  }

  function isHomepage(pageUrl: string | null): boolean {
    if (!pageUrl) return true
    if (!normalizedHomepage) return false
    return normalizeUrl(pageUrl, websiteUrl) === normalizedHomepage
  }

  const sortedIssues = rawIssues
    .slice()
    .sort((a, b) => (a.page_url ?? '').localeCompare(b.page_url ?? ''))

  const groups = new Map<string, GroupAccumulator>()

  for (const issue of sortedIssues) {
    const key = `${issue.title}|${issue.type}|${issue.severity}`
    const resolvedPageUrl = resolvePageUrl(issue.page_url)
    const homepageHit = isHomepage(issue.page_url)

    const existing = groups.get(key)
    if (existing) {
      existing.pageUrls.add(resolvedPageUrl)
      if (homepageHit) existing.homepageAffected = true
      continue
    }

    groups.set(key, {
      title: issue.title,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      recommendation: issue.recommendation,
      pageUrls: new Set([resolvedPageUrl]),
      homepageAffected: homepageHit,
    })
  }

  const aggregated: AggregatedIssue[] = Array.from(groups.values()).map((group) => {
    const affectedPageUrls = Array.from(group.pageUrls).sort()
    const affectedPageCount = affectedPageUrls.length
    const priorityScore = calculatePriorityScore(
      group.severity,
      group.homepageAffected,
      affectedPageCount
    )

    return {
      title: group.title,
      type: group.type,
      severity: group.severity,
      description: group.description,
      recommendation: group.recommendation,
      affectedPageUrls,
      affectedPageCount,
      homepageAffected: group.homepageAffected,
      priorityScore,
      priorityLabel: priorityLabelFor(priorityScore),
    }
  })

  aggregated.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore

    const severityDiff = (SEVERITY_RANK[b.severity] ?? -1) - (SEVERITY_RANK[a.severity] ?? -1)
    if (severityDiff !== 0) return severityDiff

    return b.affectedPageCount - a.affectedPageCount
  })

  return aggregated
}
