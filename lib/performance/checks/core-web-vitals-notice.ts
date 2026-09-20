import type { PillarAnalyzerContext } from '@/lib/pillars/context'
import type { RawFinding } from '@/lib/pillars/types'

/**
 * Unified webioom engine, Prompt 2 — the honest, always-on notice that
 * Core Web Vitals (LCP/INP/CLS) are NOT measured by this engine. webioom's
 * crawler is a plain HTTP fetch (no headless browser, no real page render —
 * see lib/scanner/checks.ts's fetchPage), so it structurally cannot measure
 * what a real browser actually renders/paints. Rather than fabricating
 * values or silently omitting this dimension, this check always emits one
 * zero-score-impact opportunity finding explaining exactly this — matching
 * this phase's own explicit instruction: "If Core Web Vitals cannot be
 * truthfully measured... represent them as requiring field/browser data
 * rather than fabricating values."
 */
export function analyzeCoreWebVitalsNotice(context: PillarAnalyzerContext): RawFinding[] {
  if (context.eligiblePages.length === 0) return []

  return [
    {
      checkKey: 'core_web_vitals_not_measured',
      category: 'measurement_scope',
      scope: 'site',
      kind: 'opportunity',
      evidenceSource: 'deterministic',
      baseSeverity: 'low',
      confidence: 'high',
      title: 'Core Web Vitals (loading, interactivity, visual stability) are not measured yet',
      explanation:
        'webioom currently checks your pages\' raw server responses and markup — it does not yet load pages in a real browser, so it cannot measure Largest Contentful Paint, Interaction to Next Paint, or Cumulative Layout Shift the way real visitor experience is measured.',
      whyItMatters:
        'The findings above (page weight, render-blocking scripts, image optimization) are real, directly-measured contributors to these metrics — but the metrics themselves require either real browser measurement or real visitor data, which webioom does not fabricate.',
      recommendation: 'For Core Web Vitals scores based on real visitor data, use Google Search Console or PageSpeed Insights alongside webioom\'s findings above.',
      evidence: {},
      actionability: 'monitor',
      affectedPages: [],
    },
  ]
}
