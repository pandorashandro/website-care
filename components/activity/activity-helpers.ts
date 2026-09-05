import type { BadgeTone } from '@/components/ui/badge'
import type { FixHistoryRecord } from '@/app/dashboard/websites/[id]/fix-history'
import type { PublicVerificationStatus } from '@/lib/fixes/verification-status'

/**
 * Presentation-only mapping over the existing fix_history model. Nothing
 * here reads or writes anything new — it only translates already-stored
 * values (field, issue_title's "Rollback: " prefix convention, verification
 * status strings) into product language.
 */

const ROLLBACK_PREFIX = 'Rollback: '

/** Every rollback action in this codebase inserts its history row with this exact prefix on issue_title — the one existing signal that a row represents an Undo rather than an original Apply. */
export function isUndoRow(fix: Pick<FixHistoryRecord, 'issue_title'>): boolean {
  return fix.issue_title.startsWith(ROLLBACK_PREFIX)
}

const APPLY_ACTION_LABELS: Record<string, string> = {
  title: 'Page title updated',
  meta_description: 'Meta description updated',
  h1: 'H1 added',
  image_alt: 'Image alt text updated',
}

const UNDO_ACTION_LABELS: Record<string, string> = {
  title: 'Page title restored',
  meta_description: 'Meta description restored',
  h1: 'H1 removed',
  image_alt: 'Image alt text restored',
}

/** Never exposes raw field identifiers (title-v1, write_strategy enums, etc.) — only these fixed, human labels. */
export function getActionLabel(fix: Pick<FixHistoryRecord, 'field' | 'issue_title'>): string {
  const labels = isUndoRow(fix) ? UNDO_ACTION_LABELS : APPLY_ACTION_LABELS
  return labels[fix.field] ?? (isUndoRow(fix) ? 'Change undone' : 'Change applied')
}

export function formatPreviousValue(fix: Pick<FixHistoryRecord, 'field' | 'previous_value'>): string {
  if (fix.previous_value) return `"${fix.previous_value}"`
  return fix.field === 'h1' ? 'No heading' : 'Not set'
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Derives a short, readable filename from a stored image URL — never the full URL, never a database/media ID. */
export function formatImageLabel(imageUrl: string): string {
  try {
    const { pathname } = new URL(imageUrl)
    const filename = pathname.split('/').pop()
    return filename && filename.length > 0 ? filename : imageUrl
  } catch {
    return imageUrl
  }
}

export type VerificationCopy = { label: string; description: string; tone: BadgeTone }

/**
 * Exact semantics preserved from the existing verifiers — 'unavailable'
 * never implies the write failed, and 'pending'/'still_detected' are
 * caching-shaped explanations, not errors. Keyed by the shared
 * PublicVerificationStatus vocabulary (lib/fixes/verification-status.ts)
 * plus 'still_detected' — the one WordPress Title/Meta-specific extension
 * beyond that shared core (see that file's doc comment for why). This is
 * the ONE place that already has to interpret verification_status for both
 * WordPress and Shopify rows at once, so it is the natural, proven home
 * for this shared typing — not a change to what any verifier produces.
 * Anything else (should not happen) falls back to a safe, generic
 * "Unknown" entry rather than guessing.
 */
export const VERIFICATION_COPY: Record<PublicVerificationStatus | 'still_detected', VerificationCopy> = {
  verified: {
    label: 'Verified',
    description: 'webioom confirmed the expected result.',
    tone: 'success',
  },
  unavailable: {
    label: 'Verification unavailable',
    description: 'The change was applied, but the public result could not be confirmed.',
    tone: 'neutral',
  },
  mismatch: {
    label: 'Not confirmed',
    description: 'The change was applied, but the public page did not show the expected result.',
    tone: 'warning',
  },
  pending: {
    label: 'Pending',
    description: 'The change was applied, but the public page may still be showing a cached version.',
    tone: 'warning',
  },
  still_detected: {
    label: 'Not confirmed',
    description: "The change was applied, but the public page doesn't yet reflect it.",
    tone: 'warning',
  },
}

export const UNKNOWN_VERIFICATION_COPY: VerificationCopy = {
  label: 'Unknown',
  description: 'webioom could not determine the verification result for this change.',
  tone: 'neutral',
}

/** `status` stays a plain `string` here — it comes straight from fix_history.verification_status (a DB text column, never narrowed at the row-read boundary) — so any value outside the known vocabulary (including one that should never occur) safely falls back to UNKNOWN_VERIFICATION_COPY rather than an unsafe index. */
export function getVerificationCopy(status: string): VerificationCopy {
  return (VERIFICATION_COPY as Record<string, VerificationCopy | undefined>)[status] ?? UNKNOWN_VERIFICATION_COPY
}
