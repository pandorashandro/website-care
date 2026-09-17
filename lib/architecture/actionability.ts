import type { CheckKey, Actionability } from './types'

/**
 * Phase 27, Checkpoint G — static, per-check actionability classification
 * for Site Architecture. Mirrors lib/technical-seo/actionability.ts's own
 * reasoning exactly: no Site Architecture check has a real execution
 * backend today (no integration can safely rewrite an internal link's
 * href, restructure navigation, or insert a link with a
 * preview -> approval -> constrained write -> verify -> undo path), so
 * NOTHING here is 'safe_fix' or 'prepared_fix' — every classification is
 * honest about what webioom can currently do, never wishful about what it
 * could theoretically do.
 *
 * `as const satisfies Record<CheckKey, Actionability>` makes it a compile
 * error to add a new CheckKey without also classifying it here.
 */
export const CHECK_ACTIONABILITY = {
  orphan_page: 'guided_fix',
  deep_page: 'guided_fix',
  internal_link_to_redirect_edge: 'guided_fix',
  internal_link_to_broken_edge: 'guided_fix',
  underlinked_page: 'guided_fix',
  dead_end_page: 'monitor',
  internal_link_opportunity: 'guided_fix',
  widespread_isolated_pages: 'developer_required',
} as const satisfies Record<CheckKey, Actionability>

export function getActionability(checkKey: CheckKey): Actionability {
  return CHECK_ACTIONABILITY[checkKey]
}
