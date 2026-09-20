import type { CheckKey, Actionability } from './types'

/**
 * Phase 29 — static, per-check actionability classification for Content
 * Intelligence. Mirrors every prior category engine's own reasoning:
 * classifications reflect ACTUAL, currently-wired backend capability, never
 * what would be nice to automate later.
 *
 * No check here is 'safe_fix' or 'prepared_fix' — unlike title/meta
 * description/H1 (On-Page SEO), there is no existing execution path
 * anywhere in lib/fixes/ or lib/integrations/ that can write arbitrary page
 * BODY CONTENT to a connected platform; every existing AI/write capability
 * this codebase has (lib/ai/) is scoped to short, single-field metadata
 * (title, meta description, H1, image alt), never full page content.
 * `faq_opportunity` is 'monitor' rather than 'guided_fix' since it is an
 * OPPORTUNITY (see lib/content/health.ts), not a problem requiring action —
 * consistent with lib/on-page/actionability.ts's own "monitor" usage for
 * similarly soft, often-fine-as-is observations.
 *
 * `as const satisfies Record<CheckKey, Actionability>` makes it a compile
 * error to add a new CheckKey without also classifying it here.
 */
export const CHECK_ACTIONABILITY = {
  substantively_thin_page: 'guided_fix',
  exact_duplicate_content: 'guided_fix',
  highly_repetitive_page: 'guided_fix',
  weak_content_structure: 'guided_fix',
  faq_opportunity: 'monitor',
  page_purpose_summary: 'monitor',
  // AI-derived semantic suggestions -- guided_fix/monitor only, never
  // prepared_fix: no execution backend can write page body content, and a
  // semantic recommendation must never be labeled as an executable fix
  // when no real workflow can prepare it (this phase's own instruction).
  content_completeness_gap: 'guided_fix',
  content_completeness_opportunity: 'monitor',
} as const satisfies Record<CheckKey, Actionability>

export function getActionability(checkKey: CheckKey): Actionability {
  return CHECK_ACTIONABILITY[checkKey]
}
