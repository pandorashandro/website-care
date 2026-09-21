import { Wrench, Search, FileText, Network, Gauge, Accessibility as AccessibilityIcon, Shield, type LucideIcon } from 'lucide-react'
import type { WebsiteSubNavActive } from './website-sub-nav'

export type PillarKey = 'technical-seo' | 'on-page-seo' | 'content' | 'site-architecture' | 'performance' | 'accessibility' | 'security'

export type PillarIdentity = {
  icon: LucideIcon
  /** A CSS color value (design-token `var(...)`), never a Tailwind class — used for inline `style` (icon tint, accent bars) so the same identity works across server- and client-rendered surfaces without a Tailwind safelist. */
  accent: string
  accentSubtleBg: string
}

/**
 * Sprint 3, Prompt 2B (structural reset) — the ONE place that assigns each
 * of the seven pillars a distinct point on webioom's own brand spectrum
 * (violet/azure/teal/green, plus each one's own deeper -hover shade for the
 * other three pillars) as its identity color. This is deliberately NOT a
 * new palette: every value here already exists in app/globals.css as an
 * established brand-spectrum or brand token — assigning them per-pillar
 * turns "the seven pillars" into a recognizable, memorable system (per the
 * founder's explicit "create a stronger system" direction) without
 * inventing arbitrary new hues or drifting into rainbow-chaos territory.
 * Reused by the pillar grid tiles, each pillar report's own header, and
 * PillarSubNav's active-state indicator, so a pillar's color means the same
 * thing everywhere it appears.
 */
export const PILLAR_IDENTITY: Record<PillarKey, PillarIdentity> = {
  'technical-seo': { icon: Wrench, accent: 'var(--color-violet)', accentSubtleBg: 'var(--color-violet-subtle)' },
  'on-page-seo': { icon: Search, accent: 'var(--color-sky)', accentSubtleBg: 'var(--color-sky-subtle)' },
  content: { icon: FileText, accent: 'var(--color-teal)', accentSubtleBg: 'var(--color-teal-subtle)' },
  'site-architecture': { icon: Network, accent: 'var(--color-brand-vivid)', accentSubtleBg: 'var(--color-brand-subtle)' },
  performance: { icon: Gauge, accent: 'var(--color-violet-hover)', accentSubtleBg: 'var(--color-violet-subtle)' },
  accessibility: { icon: AccessibilityIcon, accent: 'var(--color-sky-hover)', accentSubtleBg: 'var(--color-sky-subtle)' },
  security: { icon: Shield, accent: 'var(--color-teal-hover)', accentSubtleBg: 'var(--color-teal-subtle)' },
}

/** `WebsiteSubNavActive` is a superset (it also includes non-pillar routes like 'overview'/'settings') — this narrows it down for call sites that only ever pass a real pillar key. */
export function isPillarKey(value: WebsiteSubNavActive): value is PillarKey {
  return value in PILLAR_IDENTITY
}
