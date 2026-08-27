import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'
import type { WordPressEditableContentResult } from '@/lib/integrations/wordpress/editable-content'
import type { SeoMetadataProviderResult } from '@/lib/integrations/wordpress/seo-provider'
import { generateTitleProposal, type TitleIssueKind } from './title-preview'
import type { MetaDescriptionIssueKind } from '@/lib/ai/meta-description-recommendation'
import type { H1SourceDetectionResult } from './h1-source-detection'
import type { ImageAltSourceDetectionResult } from './image-alt-source-detection'

export type FixPreview =
  | {
      status: 'ready'
      issueTitle: string
      resourceType: 'page' | 'post'
      resourceId: number
      permalink: string
      field: 'title'
      currentValue: string | null
      proposedValue: string
      explanation: string
      /** 'ai' when an AI-generated title passed validation; 'deterministic' for the existing rule-based proposal (including whenever AI was unavailable/invalid). */
      source: 'ai' | 'deterministic'
      /** Opaque, server-signed record of exactly this proposal — see lib/fixes/preview-token.ts. Required to Apply; never parsed or trusted client-side. */
      previewToken: string
    }
  /**
   * Read-only preview for a meta-description recommendation (Phase 15.2B).
   * Always AI-sourced — there is no deterministic fallback engine for meta
   * descriptions. Deliberately has NO Apply capability yet: previewToken is
   * still issued (see lib/fixes/preview-token.ts's meta-description token)
   * so Phase 15.2C's Apply flow can start consuming it without prepareFix
   * changing again, but nothing in this phase reads or trusts it for a write.
   */
  | {
      status: 'ready'
      issueTitle: string
      resourceType: 'page' | 'post'
      resourceId: number
      permalink: string
      field: 'meta_description'
      provider: 'yoast' | 'rank_math'
      currentValue: string | null
      proposedValue: string
      explanation: string
      source: 'ai'
      previewToken: string
    }
  /**
   * Read-only preview for a missing-H1 AI recommendation (Phase 15.3B).
   * Only ever built for missing_h1 issues whose source detection already
   * confirmed a supported (Gutenberg/Classic HTML) source. No deterministic
   * fallback exists. Deliberately has NO Apply capability yet — previewToken
   * is issued (see lib/fixes/preview-token.ts's H1 token) so a future write
   * phase can start consuming it, but nothing here reads or trusts it.
   */
  | {
      status: 'ready'
      issueTitle: string
      resourceType: 'page' | 'post'
      resourceId: number
      permalink: string
      field: 'h1'
      editorSource: 'gutenberg' | 'classic_html'
      currentValue: null
      proposedValue: string
      explanation: string
      source: 'ai'
      previewToken: string
    }
  /** Read-only SEO-provider diagnostic for meta-description issues — never writable yet, so there is deliberately no proposedValue/previewToken here. */
  | { status: 'diagnostic'; field: 'meta_description'; provider: SeoMetadataProviderResult }
  /** Read-only H1-source diagnostic (Phase 15.3A) — never writable yet; no H1 write path exists. Also used for multiple_h1's guided-only result even when source detection is 'supported', since no destructive fix is decided automatically. */
  | { status: 'diagnostic'; field: 'h1'; result: H1SourceDetectionResult }
  /** Read-only image-alt source diagnostic (Phase 15.4A) — never writable yet; no image-alt write path exists. */
  | { status: 'diagnostic'; field: 'image_alt'; result: ImageAltSourceDetectionResult }
  | { status: 'unsupported'; reason: string }
  | { status: 'unavailable'; reason: string }

export type FixSupport = 'title' | 'meta_description' | 'h1' | 'image_alt' | 'unsupported'

/** References the scanner's own fixed title strings rather than re-hardcoding them. */
const TITLE_ISSUE_KIND: Record<string, TitleIssueKind> = {
  [ISSUE_DEFINITIONS.missing_title.title]: 'missing',
  [ISSUE_DEFINITIONS.title_too_short.title]: 'too_short',
  [ISSUE_DEFINITIONS.title_too_long.title]: 'too_long',
}

/** References the scanner's own fixed meta-description strings rather than re-hardcoding them — mirrors TITLE_ISSUE_KIND above. */
const META_DESCRIPTION_ISSUE_KIND: Record<string, MetaDescriptionIssueKind> = {
  [ISSUE_DEFINITIONS.missing_meta_description.title]: 'missing',
  [ISSUE_DEFINITIONS.meta_description_too_short.title]: 'too_short',
  [ISSUE_DEFINITIONS.meta_description_too_long.title]: 'too_long',
}

const META_DESCRIPTION_ISSUE_TITLES = new Set<string>(Object.keys(META_DESCRIPTION_ISSUE_KIND))

export type H1IssueKind = 'missing_h1' | 'multiple_h1'

/** References the scanner's own fixed H1 issue strings rather than re-hardcoding them. */
const H1_ISSUE_KIND: Record<string, H1IssueKind> = {
  [ISSUE_DEFINITIONS.missing_h1.title]: 'missing_h1',
  [ISSUE_DEFINITIONS.multiple_h1.title]: 'multiple_h1',
}

const H1_ISSUE_TITLES = new Set<string>(Object.keys(H1_ISSUE_KIND))

const GENERIC_UNSUPPORTED_REASON = 'Preview not available yet for this fix type.'

const META_DESCRIPTION_REASON =
  'WordPress page identified, but Website Care does not yet know which SEO metadata provider controls this field.'

const TITLE_EXPLANATION = 'Website Care proposes a clearer title that stays within a recommended length.'

/**
 * Static classification — does not require loading any WordPress content,
 * so callers can skip the WordPress round-trip entirely for issue types
 * outside the supported fix family (missing H1, missing image alt, and
 * everything else) rather than fetching data only to discard it.
 */
export function classifyIssueForFixPreview(issueTitle: string): FixSupport {
  if (issueTitle in TITLE_ISSUE_KIND) return 'title'
  if (META_DESCRIPTION_ISSUE_TITLES.has(issueTitle)) return 'meta_description'
  if (H1_ISSUE_TITLES.has(issueTitle)) return 'h1'
  if (issueTitle === ISSUE_DEFINITIONS.missing_image_alt.title) return 'image_alt'
  return 'unsupported'
}

/**
 * Resolves an issue title to its specific title-fix kind for the write
 * path (applyFix), so the apply action never has to re-derive or duplicate
 * this mapping itself. Returns null for anything outside the three
 * supported title issues — the only fixes this application is ever allowed
 * to write to WordPress.
 */
export function getTitleIssueKind(issueTitle: string): TitleIssueKind | null {
  return TITLE_ISSUE_KIND[issueTitle] ?? null
}

/** Resolves an issue title to its specific meta-description-fix kind, mirroring getTitleIssueKind. Returns null for anything outside the three supported meta-description issues. */
export function getMetaDescriptionIssueKind(issueTitle: string): MetaDescriptionIssueKind | null {
  return META_DESCRIPTION_ISSUE_KIND[issueTitle] ?? null
}

/** Resolves an issue title to its specific H1 issue kind, mirroring getTitleIssueKind. Returns null for anything outside missing_h1/multiple_h1. */
export function getH1IssueKind(issueTitle: string): H1IssueKind | null {
  return H1_ISSUE_KIND[issueTitle] ?? null
}

/** A proposal already resolved by the caller (e.g. an AI recommendation, or the deterministic engine run ahead of time) — see prepareFix. */
export type ResolvedTitleProposal = {
  proposedValue: string
  explanation: string
  source: 'ai' | 'deterministic'
}

function buildTitleFixPreview(
  issueTitle: string,
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>,
  websiteName: string | null,
  resolvedProposal?: ResolvedTitleProposal
): FixPreview {
  let resolved: ResolvedTitleProposal

  if (resolvedProposal) {
    resolved = resolvedProposal
  } else {
    const issueKind = TITLE_ISSUE_KIND[issueTitle]
    const proposal = generateTitleProposal(issueKind, {
      currentTitle: content.title,
      slug: content.slug,
      websiteName,
    })

    if (!proposal.ok) {
      return { status: 'unavailable', reason: proposal.reason }
    }

    resolved = { proposedValue: proposal.proposedValue, explanation: TITLE_EXPLANATION, source: 'deterministic' }
  }

  return {
    status: 'ready',
    issueTitle,
    resourceType: content.resourceType,
    resourceId: content.resourceId,
    permalink: content.permalink,
    field: 'title',
    currentValue: content.title,
    proposedValue: resolved.proposedValue,
    explanation: resolved.explanation,
    source: resolved.source,
    // Attached by the caller (prepareFix) once the final proposal is known —
    // signing requires the server-only preview-token module, which this
    // otherwise-pure composition module deliberately does not depend on.
    previewToken: '',
  }
}

/**
 * Wraps an already-computed SEO-provider detection result (see
 * lib/integrations/wordpress/seo-provider.ts) into a diagnostic-only
 * FixPreview. Pure — the provider detection itself (which requires a
 * network call) happens in the caller (prepareFix), not here.
 */
export function buildMetaDescriptionDiagnostic(provider: SeoMetadataProviderResult): FixPreview {
  return { status: 'diagnostic', field: 'meta_description', provider }
}

/**
 * Wraps an already-computed H1 source-detection result (see
 * lib/fixes/h1-source-detection.ts) into a diagnostic-only FixPreview. Pure
 * — the detection itself (which requires a public-page fetch) happens in
 * the caller (prepareFix), not here.
 */
export function buildH1Diagnostic(result: H1SourceDetectionResult): FixPreview {
  return { status: 'diagnostic', field: 'h1', result }
}

/**
 * Wraps an already-computed image-alt source-detection result (see
 * lib/fixes/image-alt-source-detection.ts) into a diagnostic-only
 * FixPreview. Pure — the detection itself (which may issue WordPress
 * requests) happens in the caller (prepareFix), not here.
 */
export function buildImageAltDiagnostic(result: ImageAltSourceDetectionResult): FixPreview {
  return { status: 'diagnostic', field: 'image_alt', result }
}

/**
 * Assembles a ready-to-show (but not-yet-writable) missing-H1 AI preview.
 * Pure — the AI call and source detection both happen in the caller
 * (prepareFix).
 */
export function buildH1ReadyPreview(params: {
  issueTitle: string
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>
  editorSource: 'gutenberg' | 'classic_html'
  proposedValue: string
  explanation: string
  previewToken: string
}): FixPreview {
  return {
    status: 'ready',
    issueTitle: params.issueTitle,
    resourceType: params.content.resourceType,
    resourceId: params.content.resourceId,
    permalink: params.content.permalink,
    field: 'h1',
    editorSource: params.editorSource,
    currentValue: null,
    proposedValue: params.proposedValue,
    explanation: params.explanation,
    source: 'ai',
    previewToken: params.previewToken,
  }
}

/**
 * Assembles a ready-to-show (but not-yet-writable) meta-description
 * preview from an already-resolved AI recommendation and an already
 * confirmed writable provider mapping. Pure — the AI call and provider
 * detection both happen in the caller (prepareFix).
 */
export function buildMetaDescriptionReadyPreview(params: {
  issueTitle: string
  content: Extract<WordPressEditableContentResult, { status: 'loaded' }>
  provider: 'yoast' | 'rank_math'
  currentValue: string | null
  proposedValue: string
  explanation: string
  previewToken: string
}): FixPreview {
  return {
    status: 'ready',
    issueTitle: params.issueTitle,
    resourceType: params.content.resourceType,
    resourceId: params.content.resourceId,
    permalink: params.content.permalink,
    field: 'meta_description',
    provider: params.provider,
    currentValue: params.currentValue,
    proposedValue: params.proposedValue,
    explanation: params.explanation,
    source: 'ai',
    previewToken: params.previewToken,
  }
}

/**
 * Composes the final Current -> Proposed preview (or a safe unsupported /
 * unavailable explanation) from already-loaded editable WordPress content.
 * Pure and network-free itself — all WordPress I/O (and any AI call) happens
 * before this is called. Callers that already resolved a title proposal
 * (e.g. prepareFix, after trying AI) pass it via `resolvedProposal`;
 * omitting it preserves the original deterministic-only behavior.
 */
export function buildFixPreview(
  issueTitle: string,
  content: WordPressEditableContentResult,
  websiteName: string | null,
  resolvedProposal?: ResolvedTitleProposal
): FixPreview {
  if (content.status !== 'loaded') {
    return { status: 'unavailable', reason: content.reason }
  }

  const support = classifyIssueForFixPreview(issueTitle)

  if (support === 'meta_description') {
    return { status: 'unsupported', reason: META_DESCRIPTION_REASON }
  }

  if (support === 'h1') {
    return { status: 'unsupported', reason: GENERIC_UNSUPPORTED_REASON }
  }

  if (support === 'image_alt') {
    return { status: 'unsupported', reason: GENERIC_UNSUPPORTED_REASON }
  }

  if (support === 'unsupported') {
    return { status: 'unsupported', reason: GENERIC_UNSUPPORTED_REASON }
  }

  return buildTitleFixPreview(issueTitle, content, websiteName, resolvedProposal)
}
