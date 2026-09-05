/**
 * Phase 21 — the universal public-verification vocabulary, extracted after
 * observing it independently converge across every current verifier:
 *
 *   verify-rollback.ts (WordPress title rollback)      verified/pending/mismatch/unavailable
 *   verify-h1-fix.ts (WordPress H1 apply)               verified/pending/mismatch/unavailable
 *   verify-shopify-public-value.ts (Shopify apply+undo) verified/pending/mismatch/unavailable
 *   verify-title-fix.ts / verify-meta-description-fix.ts (WordPress apply)
 *                                                        adds 'still_detected' on top
 *   verify-image-alt-fix.ts (WordPress apply+undo)       omits 'pending' (no caching case)
 *
 * This type is the shared CORE every one of those is either exactly equal
 * to, a subset of, or a superset of — never forced into a single shape.
 * `still_detected` (title/meta only — "the write succeeded, but the
 * ORIGINAL scanner issue kind still isn't resolved") is a genuinely
 * platform/field-specific extension, not part of the universal core: a
 * Shopify or H1 Apply always knows the single exact value it wrote and only
 * ever needs to ask "does the public page show exactly that," so neither
 * has (or should invent) a 'still_detected' case.
 *
 * This is a VOCABULARY, not a verifier. It does not replace any existing
 * verifier's fetch/extract/compare logic — that stays entirely
 * platform-specific (different HTML extraction, different SSRF/redirect
 * handling per platform's own scanner primitives, different "is this a
 * gate page" detection). What it standardizes is only the finite set of
 * OUTCOMES a caller (a fix-result UI, fix_history.verification_status, a
 * future Wix verifier) needs to be able to render or store, so that:
 *
 * - a shared cross-platform consumer (e.g.
 *   components/activity/activity-helpers.ts's VERIFICATION_COPY, which
 *   already has to interpret this column for both WordPress and Shopify
 *   rows in one place) can be typed precisely instead of against a bare
 *   `Record<string, ...>`.
 * - a future platform adapter has an existing, proven vocabulary to target
 *   from day one instead of inventing its own status strings.
 *
 * Every value here means EXACTLY what it already means in every verifier
 * above — this file does not redefine or narrow their semantics:
 * - 'verified'    — the public result now matches what was written.
 * - 'pending'     — the public result still matches what was there
 *                   immediately before this write (a caching signal, not
 *                   an error).
 * - 'mismatch'    — the public result matches neither the new nor the
 *                   pre-write value.
 * - 'unavailable' — the public result could not be safely checked at all
 *                   (network/parse failure, ambiguous match, access-gated
 *                   response, etc.) — NEVER implies the underlying write
 *                   failed.
 */
export type PublicVerificationStatus = 'verified' | 'pending' | 'mismatch' | 'unavailable'
