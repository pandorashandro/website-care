import type { FixabilityResult } from '@/lib/fixes/fixability'
import type { IntegrationConnectionState } from '@/lib/integrations/platform'
import { getTitleIssueKind, getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'
import { hasAnyScope, type ShopifyGrantedScopeSet } from './scopes'

/**
 * Phase 20.1H — report-level fixability for the two Shopify fix families
 * that actually exist (title, meta_description). Deliberately separate from
 * lib/fixes/fixability.ts rather than folded into it: WordPress's
 * evaluateFixability reasons about ONE generic two-key capability snapshot
 * (edit_content/upload_media) resolved from a single connected integration,
 * but Shopify's real capability policy (capabilities.ts) is keyed by
 * (fixFamily, resourceType) and can only be evaluated after resolving which
 * Shopify resource a URL maps to — a live Admin API call per page. Doing
 * that for every issue on a report page is not viable, so this module
 * intentionally stays coarser: it only checks whether the connected store
 * grants ANY plausible write scope for title/meta_description at all. The
 * exact (fixFamily, resourceType) decision from capabilities.ts is still
 * re-checked live, for real, at Prepare and Apply time — this function only
 * decides whether to show a "Fix available" badge and a Prepare button, and
 * Prepare's own 'unavailable' result is still the authoritative answer.
 *
 * H1 and Image Alt are deliberately unreachable here: getTitleIssueKind and
 * getMetaDescriptionIssueKind both return null for anything outside
 * title/meta_description issue titles, so this function returns null for
 * every other issue type and the caller must keep using whatever fixability
 * result it already had (e.g. WordPress's). This is the mechanism that
 * keeps H1 "guided/manual" and Image Alt entirely out of scope for Shopify,
 * without this module ever needing to enumerate them.
 */
export type ShopifyIssueFixabilityContext = {
  issueTitle: string
  connectionState: IntegrationConnectionState
  /** Only meaningful when connectionState === 'connected'. */
  grantedScopes: ShopifyGrantedScopeSet | null
}

const SHOPIFY_FIX_REASON = 'This can be updated directly through your connected Shopify store once permissions are confirmed.'

export function evaluateShopifyIssueFixability(context: ShopifyIssueFixabilityContext): FixabilityResult | null {
  const isTitleIssue = getTitleIssueKind(context.issueTitle) !== null
  const isMetaIssue = !isTitleIssue && getMetaDescriptionIssueKind(context.issueTitle) !== null

  if (!isTitleIssue && !isMetaIssue) {
    return null
  }

  if (context.connectionState === 'not_connected') {
    return {
      level: 'manual',
      reason: `${SHOPIFY_FIX_REASON} Connect Shopify to let webioom assist with this automatically.`,
      requiresIntegration: true,
    }
  }

  if (context.connectionState === 'needs_attention') {
    return {
      level: 'unavailable',
      reason: 'Your Shopify connection needs attention before webioom can assist with this fix.',
      requiresIntegration: true,
    }
  }

  // connectionState === 'connected'. Coarse scope check only — see module
  // doc comment for why the exact resource-type-specific decision is not
  // (and cannot cheaply be) made here.
  const hasWriteScope = context.grantedScopes ? hasAnyScope(context.grantedScopes, ['write_products', 'write_content']) : false

  if (!hasWriteScope) {
    return {
      level: 'unavailable',
      reason: 'Your connected Shopify account does not currently grant permission for this fix.',
      requiresIntegration: true,
    }
  }

  return {
    level: 'assisted',
    reason: SHOPIFY_FIX_REASON,
    requiresIntegration: true,
  }
}
