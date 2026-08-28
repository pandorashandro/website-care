import type { BadgeTone } from '@/components/ui/badge'

/**
 * Presentation-only mapping from a score to a human label/tone — deliberately
 * mirrors the exact thresholds used on the website report page
 * (app/dashboard/websites/[id]/page.tsx's healthLabel/healthBadgeClass) so
 * the dashboard and the detailed report can never disagree about what "87"
 * means. Not touched by, and does not touch, calculate-health-score.ts —
 * this only labels an already-computed score, never derives one.
 */
export function healthLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Needs Attention'
  return 'Poor'
}

export function healthTone(score: number): BadgeTone {
  if (score >= 90) return 'success'
  if (score >= 75) return 'success'
  if (score >= 50) return 'warning'
  return 'danger'
}

/** A website "needs attention" using the same Needs Attention/Poor boundary as healthLabel — never a separately invented threshold. */
export function needsAttention(score: number): boolean {
  return score < 75
}
