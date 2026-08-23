export const TITLE_MIN_LENGTH = 30
export const TITLE_MAX_LENGTH = 60

export type TitleLengthStatus = 'missing' | 'too_short' | 'too_long' | 'ok'

/**
 * The single source of truth for what counts as a missing/too-short/too-long
 * page title. Shared by the scanner (analyze-page.ts) and the post-fix
 * verifier (lib/fixes/verify-title-fix.ts) so the two can never drift apart —
 * a page the scanner would flag is exactly a page the verifier would still
 * consider unresolved, and vice versa.
 */
export function classifyTitleLength(titleText: string | null): TitleLengthStatus {
  if (!titleText) return 'missing'
  if (titleText.length < TITLE_MIN_LENGTH) return 'too_short'
  if (titleText.length > TITLE_MAX_LENGTH) return 'too_long'
  return 'ok'
}
