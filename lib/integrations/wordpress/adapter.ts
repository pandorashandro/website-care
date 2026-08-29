import 'server-only'
import type { PlatformType, RequiredIntegrationCapability, IntegrationCapabilityState } from '@/lib/integrations/platform'
import { verifyWordPressCredentials } from './client'
import type { VerifyWordPressResult, VerifyWordPressReason } from './client'
import { checkWordPressCapabilities } from './capabilities'
import type { WordPressCapabilities, WordPressCapabilityResult, WordPressConnectionState } from './capabilities'
import { mapWordPressContent } from './content-mapping'
import type { WordPressContentMapping } from './content-mapping'
import { loadWordPressEditableContent } from './editable-content'
import type { WordPressEditableContentResult } from './editable-content'
import { detectSeoMetadataProvider } from './seo-provider'
import type { SeoMetadataProviderResult, SeoProviderWriteStrategy } from './seo-provider'
import { detectH1Source, classifyH1ContentSource } from '@/lib/fixes/h1-source-detection'
import type { H1SourceDetectionResult, H1ContentSource } from '@/lib/fixes/h1-source-detection'
import { detectImageAltSource, findContentImageOccurrences } from '@/lib/fixes/image-alt-source-detection'
import type {
  ImageAltSourceDetectionResult,
  ImageAltSource,
  ImageAltWriteStrategy,
  ContentImageOccurrence,
} from '@/lib/fixes/image-alt-source-detection'
import { updateWordPressTitle } from './write-title'
import type { WordPressTitleUpdateResult } from './write-title'
import { updateWordPressMetaDescription } from './write-meta-description'
import type { WordPressMetaDescriptionUpdateResult } from './write-meta-description'
import { updateWordPressH1Content } from './write-h1-content'
import type { WordPressH1ContentUpdateResult } from './write-h1-content'
import { updateWordPressImageAltContent } from './write-image-alt-content'
import type { WordPressImageAltContentUpdateResult } from './write-image-alt-content'
import { updateWordPressMediaAltText } from './write-image-alt-media'
import type { WordPressMediaAltTextUpdateResult } from './write-image-alt-media'

/**
 * WordPress integration boundary (Phase 19.3; fully adopted by Phase 19.5A–D;
 * reviewed for consolidation in Phase 19.5E).
 *
 * This module is a THIN composition layer over the existing WordPress
 * modules in this directory (plus two closely-related detection modules in
 * lib/fixes/ — see the H1/Image Alt sections below). It introduces almost no
 * new logic. Every re-exported function is called exactly as it already
 * was; nothing about its implementation, parameters, or behavior changed.
 *
 * As of Phase 19.5D, all four existing fix families (Title, Meta
 * Description, Missing H1, Missing Image Alt) route their platform-specific
 * operations through this boundary — the shared `prepareFix` function and
 * all eight `wordpress-*-fix-actions.ts` / `wordpress-*-rollback-actions.ts`
 * orchestration files depend on the namespaces below rather than importing
 * the underlying low-level modules directly. Phase 19.5E's dependency audit
 * (see that phase's report) confirmed no remaining bypass paths.
 *
 * Explicitly NOT done here, by design:
 *
 * - No giant `IntegrationAdapter` object was created. There is no single
 *   export with dozens of methods (connect/disconnect/read/write/verify/
 *   undo/...). Responsibilities are grouped into small, independently
 *   understandable namespaces below, mirroring the module boundaries that
 *   already existed.
 * - No generic writer. `wordpressWriters` groups five *already distinct*
 *   field-specific functions under one namespace for discoverability —
 *   it is not a `write(field, value)` function. Each property has its own
 *   fixed signature; nothing lets a caller select a field dynamically.
 * - The ownership-verification + credential-decryption layer
 *   (app/dashboard/websites/[id]/wordpress-credentials.ts and
 *   wordpress-capabilities.ts) is deliberately NOT wrapped or moved here.
 *   That layer mixes webioom's own Supabase ownership check (RLS-adjacent,
 *   re-verifying `websites.user_id` on every call) with WordPress credential
 *   decryption. lib/integrations/wordpress/ currently has zero Supabase/DB
 *   dependencies — pulling that layer in here would blur a boundary that is
 *   otherwise clean, for no benefit ever actually needed across Phase 19.5's
 *   four migrations. Re-confirmed still correct in the Phase 19.5E review.
 */

// ============================================================================
// 1. PLATFORM IDENTITY
// ============================================================================

/** This adapter's platform identity — see lib/integrations/platform.ts. */
export const WORDPRESS_PLATFORM: PlatformType = 'wordpress'

// ============================================================================
// 2. CONNECTION BOUNDARY
// ============================================================================

/**
 * Verifies WordPress credentials directly against the WordPress site
 * (unauthenticated ownership/ownership-of-session concerns are handled
 * upstream — see module doc comment). Thin re-export of client.ts's
 * existing function; no behavior change.
 */
export const wordpressConnection = {
  verify: verifyWordPressCredentials,
} as const

export type { VerifyWordPressResult, VerifyWordPressReason }

// ============================================================================
// 3. CAPABILITY BOUNDARY
// ============================================================================

export const wordpressCapabilities = {
  /** Thin re-export of capabilities.ts's existing function; no behavior change. */
  check: checkWordPressCapabilities,
  /** See resolveRequiredWordPressCapability below. */
  resolveRequired: resolveRequiredWordPressCapability,
} as const

export type { WordPressCapabilities, WordPressCapabilityResult, WordPressConnectionState }

/**
 * Resolves a webioom-level RequiredIntegrationCapability (edit_content /
 * upload_media — see lib/integrations/platform.ts) against WordPress's own
 * native capability model, preserving fail-closed semantics: 'unknown' is
 * only ever returned when the underlying signal is genuinely ambiguous,
 * never coerced toward 'available'.
 *
 * The 'edit_content' branch deliberately duplicates what
 * lib/fixes/fixability.ts's resolver used to do byte-for-byte rather than
 * importing it — Phase 19.4 removed that internal resolver from
 * fixability.ts entirely (not merely superseded it) and routed
 * fixability.ts's evaluation through IntegrationCapabilitySnapshot values
 * supplied by callers instead. This function is that supply path: it has
 * been called by wordpress-capabilities.ts's toIntegrationFixabilityInputs()
 * since Phase 19.4, which builds the snapshot fixability.ts now consumes.
 */
export function resolveRequiredWordPressCapability(
  required: RequiredIntegrationCapability,
  capabilities: WordPressCapabilities
): IntegrationCapabilityState {
  if (required === 'upload_media') {
    return capabilities.canUploadMedia
  }

  // required === 'edit_content'
  if (capabilities.canEditPages === 'available' || capabilities.canEditPosts === 'available') {
    return 'available'
  }
  if (capabilities.canEditPages === 'unknown' || capabilities.canEditPosts === 'unknown') {
    return 'unknown'
  }
  return 'unavailable'
}

// ============================================================================
// 4. CONTENT / RESOURCE RESOLUTION BOUNDARY
// ============================================================================

export const wordpressResources = {
  /** Thin re-export of content-mapping.ts's existing function; no behavior change. */
  map: mapWordPressContent,
  /** Thin re-export of editable-content.ts's existing function (mapping + load + link re-confirmation, unchanged); no behavior change. */
  loadEditable: loadWordPressEditableContent,
} as const

export type { WordPressContentMapping, WordPressEditableContentResult }

// ============================================================================
// 5. METADATA PROVIDER BOUNDARY (Meta Description — Phase 19.5B)
// ============================================================================

/**
 * WordPress SEO-plugin metadata detection (Yoast / Rank Math / AIOSEO) is
 * inherently WordPress-specific — a future platform may have no equivalent
 * concept of a third-party SEO plugin ecosystem at all, so this is exposed
 * as a WordPress-only namespace, not a generic "SeoProvider"/"MetadataProvider"
 * abstraction. Thin re-export of seo-provider.ts's existing function; no
 * behavior change, no new providers, no rewritten detection logic.
 */
export const wordpressMetadataProvider = {
  detect: detectSeoMetadataProvider,
  /** See toMetaDescriptionWriteStrategy below. */
  toWriteStrategy: toMetaDescriptionWriteStrategy,
} as const

export type { SeoMetadataProviderResult, SeoProviderWriteStrategy }

/**
 * Phase 19.5B-S — the exact, persistable write mechanism for a
 * meta-description fix. Provider alone is sufficient to identify it:
 * YOAST_META_FIELD/RANK_MATH_META_FIELD (seo-provider.ts) are fixed
 * constants, never derived or variable per resource, so 'yoast' can only
 * ever mean a write to that one field. This is what fix_history.write_strategy
 * stores for field='meta_description' rows (mirroring the role
 * write_strategy already played for image_alt), and what Undo compares
 * against a fresh re-detection before ever writing — see
 * wordpress-meta-fix-actions.ts and wordpress-meta-rollback-actions.ts.
 */
export type MetaDescriptionWriteStrategy = 'yoast_meta_description' | 'rank_math_meta_description'

/** Pure, single source of truth for the provider -> write-strategy-string mapping, used identically by Apply (to record it) and Undo (to prove it still matches). */
export function toMetaDescriptionWriteStrategy(provider: 'yoast' | 'rank_math'): MetaDescriptionWriteStrategy {
  return provider === 'yoast' ? 'yoast_meta_description' : 'rank_math_meta_description'
}

// ============================================================================
// 6. H1 SOURCE BOUNDARY (Missing H1 — Phase 19.5C)
// ============================================================================

/**
 * Gutenberg-vs-Classic-HTML content classification is inherently a
 * WordPress content-serialization concern — a future platform's editor
 * model may have no equivalent concept at all — so this stays a
 * WordPress-only namespace, not a generic "IntegrationContentSource" or
 * "CmsContentMode" abstraction. Thin re-export of the existing detection
 * functions (still implemented in lib/fixes/h1-source-detection.ts, not
 * moved here); no behavior change, no rewritten detection rules. Both
 * Prepare/Apply (detect) and Undo (classifySource, used to deterministically
 * reconstruct the exact snippet that was inserted — see
 * lib/fixes/h1-content-transform.ts) route through this one namespace.
 */
export const wordpressH1Source = {
  detect: detectH1Source,
  classifySource: classifyH1ContentSource,
} as const

export type { H1SourceDetectionResult, H1ContentSource }

// ============================================================================
// 7. IMAGE ALT SOURCE BOUNDARY (Missing Image Alt — Phase 19.5D)
// ============================================================================

/**
 * Media Library resources, Gutenberg/Classic HTML content matching, and
 * `wp-image-{id}` class conventions are all WordPress-specific facts — a
 * future platform may model images completely differently (or not have a
 * separate media library concept at all) — so this stays a WordPress-only
 * namespace, not a generic "IntegrationImageSource"/"UniversalAssetIdentity"
 * abstraction. Thin re-export of the existing functions (still implemented
 * in lib/fixes/image-alt-source-detection.ts, not moved here); no behavior
 * change, no rewritten matching/detection rules, no fuzzy matching
 * introduced. `findContentOccurrences` is included because orchestration
 * (both Apply and Undo) calls it directly for post-write response
 * validation, exactly as it called `detect` directly for source detection —
 * both are WordPress-content-parsing operations orchestration depends on.
 *
 * Not included here (deliberately): image-alt-source-detection.ts's own
 * internal use of classifyH1ContentSource (from lib/fixes/h1-source-detection.ts)
 * is left as a direct sibling import, unchanged — see the Phase 19.5D report
 * for why routing that internal dependency through this adapter would add
 * an indirection with no architectural benefit.
 */
export const wordpressImageAltSource = {
  detect: detectImageAltSource,
  findContentOccurrences: findContentImageOccurrences,
} as const

export type { ImageAltSourceDetectionResult, ImageAltSource, ImageAltWriteStrategy, ContentImageOccurrence }

// ============================================================================
// 8. FIELD-SPECIFIC WRITERS — grouped for discovery, never generic
// ============================================================================

/**
 * Five distinct, independently-typed functions, one per supported field.
 * This is a lookup namespace for discoverability only — there is no
 * `write(field, value)` here. Each property has its own fixed parameter
 * list (see the individual write-*.ts files); nothing lets a caller select
 * or construct an arbitrary field/body at runtime. This is the exact
 * one-writer-per-field property the Phase 19.1 audit flagged as a security
 * invariant, preserved intact.
 */
export const wordpressWriters = {
  title: updateWordPressTitle,
  metaDescription: updateWordPressMetaDescription,
  h1Content: updateWordPressH1Content,
  imageAltContent: updateWordPressImageAltContent,
  imageAltMedia: updateWordPressMediaAltText,
} as const

export type {
  WordPressTitleUpdateResult,
  WordPressMetaDescriptionUpdateResult,
  WordPressH1ContentUpdateResult,
  WordPressImageAltContentUpdateResult,
  WordPressMediaAltTextUpdateResult,
}
