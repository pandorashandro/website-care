import { Search, Server, Accessibility, Gauge, FileText, Wrench, Compass, ShieldAlert } from 'lucide-react'
import type { Category } from '@/lib/scanner/calculate-health-score'
import type { AggregatedIssue } from '@/lib/scanner/aggregate-issues'
import type { FixabilityLevel, FixabilityResult } from '@/lib/fixes/fixability'
import type { BadgeTone } from '@/components/ui/badge'

/**
 * An aggregated issue decorated once, server-side, with the facts every
 * report component needs but neither aggregateIssues nor evaluateFixability
 * knows how to produce on their own: a stable anchor id (so "Needs your
 * attention" can link straight to the full card below), its precomputed
 * fixability result, and which connected platform (if any) is the one
 * actually offering that fixability result. `fixability` itself
 * (lib/fixes/fixability.ts) stays completely platform-agnostic and
 * untouched; `fixProvider` is computed alongside it, in the page, purely to
 * let IssueGroup decide which Prepare-Fix component to render (WordPress's
 * existing one, Shopify's, or Wix's) without lib/fixes/fixability.ts ever
 * needing to know a second or third platform exists. `fixProvider` is null
 * whenever no platform is offering an assisted fix for this issue
 * (fixability.level !== 'assisted'), and also null for every issue type
 * Shopify/Wix have no opinion on (H1, Image Alt, everything else) even
 * when that platform is connected — see
 * lib/integrations/shopify/issue-fixability.ts and
 * lib/integrations/wix/issue-fixability.ts.
 */
export type DecoratedIssue = AggregatedIssue & {
  anchorId: string
  fixability: FixabilityResult
  fixProvider: 'wordpress' | 'shopify' | 'wix' | null
  /** Only set when fixProvider === 'shopify' — the trusted issue row id Shopify's Prepare-Fix flow requires (see shopify-title-issue.ts/shopify-meta-issue.ts). WordPress's own fix flow never needs this. */
  shopifyIssueId?: string
  /** Only set when fixProvider === 'wix' — the trusted issue row id Wix's Prepare-Fix flow requires (see wix-title-issue.ts/wix-meta-issue.ts). */
  wixIssueId?: string
}

/**
 * Pure presentation helpers shared across the redesigned report components.
 * None of this changes what data means — only how the existing values
 * (category keys, severity strings, fixability levels) are labeled/colored.
 */

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Older issue rows may have page_url = null (created before that column
 * existed), so this must degrade gracefully rather than throw.
 */
export function formatPageLabel(pageUrl: string | null): string {
  if (!pageUrl) return 'Homepage'

  try {
    const { pathname, search } = new URL(pageUrl)
    const path = `${pathname}${search}`
    return path === '' || path === '/' ? 'Homepage' : path
  } catch {
    return pageUrl
  }
}

export const CATEGORY_ORDER: Category[] = ['seo', 'technical', 'accessibility', 'performance', 'content']

export const CATEGORY_LABELS: Record<Category, string> = {
  seo: 'SEO',
  technical: 'Technical',
  accessibility: 'Accessibility',
  performance: 'Performance',
  content: 'Content',
}

/** Same icon choices as the public /website-health page, so the product feels like one system across the marketing site and the app. */
export const CATEGORY_ICONS: Record<Category, typeof Search> = {
  seo: Search,
  technical: Server,
  accessibility: Accessibility,
  performance: Gauge,
  content: FileText,
}

export function formatCategory(type: string): string {
  return CATEGORY_LABELS[type as Category] ?? type.charAt(0).toUpperCase() + type.slice(1)
}

export function isKnownCategory(type: string): type is Category {
  return (CATEGORY_ORDER as string[]).includes(type)
}

export const SEVERITY_DISPLAY_ORDER = ['critical', 'high', 'medium', 'low'] as const

export const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** Critical and high share the 'danger' tone — the same collapsing already used on the public /website-health page's severity legend. Text labels still fully distinguish them. */
export function severityTone(severity: string): BadgeTone {
  if (severity === 'critical' || severity === 'high') return 'danger'
  if (severity === 'medium') return 'warning'
  if (severity === 'low') return 'info'
  return 'neutral'
}

/**
 * Deliberately generic — the fixability engine only ever returns
 * assisted/manual/unavailable, never an AI-vs-deterministic distinction, so
 * the label never claims "AI-Assisted" here. Which specific approach a fix
 * uses is only known once Prepare Fix actually runs.
 */
export const FIXABILITY_LABELS: Record<FixabilityLevel, string> = {
  assisted: 'Fix available',
  manual: 'Guided recommendation',
  unavailable: 'Not currently supported for direct fixing',
}

export function fixabilityTone(level: FixabilityLevel): BadgeTone {
  if (level === 'assisted') return 'success'
  if (level === 'manual') return 'info'
  return 'neutral'
}

/** Shared between IssueActionPanel and PriorityIssues so the same action state always shows the same icon. */
export const FIXABILITY_ICON: Record<FixabilityLevel, typeof Wrench> = {
  assisted: Wrench,
  manual: Compass,
  unavailable: ShieldAlert,
}
