import type { Severity } from './types'

/**
 * Phase 28 — the shared deduction-model primitives, extracted once a THIRD
 * category engine (lib/on-page/) needed the identical formula
 * lib/technical-seo/health.ts (Phase 26) and lib/architecture/health.ts
 * (Phase 27) had each already independently implemented byte-for-byte
 * identically (SEVERITY_DEDUCTION/CONFIDENCE_MULTIPLIER/SEVERITY_TIER_CAP
 * constants, and a page-fraction spread bucketing function). This is
 * exactly the extraction lib/architecture/aggregate.ts's own doc comment
 * anticipated: "a genuine candidate for extraction into lib/category-engine/
 * once a THIRD category engine needs the identical orchestration, not
 * before."
 *
 * Deliberately NOT wired back into lib/technical-seo/health.ts or
 * lib/architecture/health.ts as re-exports — both are part of already-
 * accepted, fully-tested category engines, and Phase 28's own instructions
 * explicitly forbid changing Technical SEO's or Site Architecture's scoring
 * behavior, even via a behavior-preserving refactor. This module is the
 * canonical home for every FUTURE category engine's health score; the two
 * existing duplicates are left as documented, low-priority tech debt.
 *
 * See docs/category-score-standard.md for the full reusable STANDARD this
 * formula is checked against (that standard was always deliberately "not
 * necessarily one shared formula" — this module is the first case where
 * sharing the literal formula turned out to be genuinely warranted, not a
 * retroactive mandate to unify the earlier two).
 */
export const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 25, high: 15, medium: 7, low: 3 }
export const CONFIDENCE_MULTIPLIER: Record<'high' | 'medium' | 'low', number> = { high: 1, medium: 0.7, low: 0.4 }
export const SEVERITY_TIER_CAP: Record<Severity, number> = { critical: 100, high: 60, medium: 30, low: 15 }

/**
 * Buckets an affected-count fraction of the analyzed population into a
 * bounded spread multiplier: <20% of the population -> 1x, 20-49% -> 1.25x,
 * >=50% -> 1.5x. Identical to Technical SEO's `spreadMultiplier` and Site
 * Architecture's `pageFractionSpread` (both unchanged, left in place).
 */
export function fractionSpread(count: number, total: number): number {
  if (total <= 0) return 1
  const fraction = count / total
  if (fraction >= 0.5) return 1.5
  if (fraction >= 0.2) return 1.25
  return 1
}

export function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}
