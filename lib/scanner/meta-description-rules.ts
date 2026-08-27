export const META_DESCRIPTION_MIN_LENGTH = 70
export const META_DESCRIPTION_MAX_LENGTH = 160

export type MetaDescriptionLengthStatus = 'missing' | 'too_short' | 'too_long' | 'ok'

/**
 * The single source of truth for what counts as a missing/too-short/too-long
 * meta description. Shared by the scanner (analyze-page.ts) and the post-fix
 * verifiers (lib/fixes/verify-meta-description-fix.ts) so the two can never
 * drift apart — mirrors lib/scanner/title-rules.ts's role for titles.
 */
export function classifyMetaDescriptionLength(value: string | null): MetaDescriptionLengthStatus {
  if (!value) return 'missing'
  if (value.length < META_DESCRIPTION_MIN_LENGTH) return 'too_short'
  if (value.length > META_DESCRIPTION_MAX_LENGTH) return 'too_long'
  return 'ok'
}
