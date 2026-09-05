import type { FixabilityResult } from '@/lib/fixes/fixability'
import type { IntegrationConnectionState } from '@/lib/integrations/platform'
import { getTitleIssueKind, getMetaDescriptionIssueKind } from '@/lib/fixes/fix-preview'

/**
 * Wix V1 Prompt 2 — report-level fixability for the two Wix fix families
 * that actually exist (title, meta_description), mirroring
 * lib/integrations/shopify/issue-fixability.ts's exact contract: returns
 * the shared FixabilityResult type without forcing Wix through
 * evaluateFixability's generic two-key IntegrationCapabilitySnapshot (Wix's
 * real capability model — resource-type + primary-language — doesn't fit
 * that shape any better than Shopify's scope-based one did).
 *
 * Deliberately coarser than lib/integrations/wix/capabilities.ts's
 * evaluateWixFixCapability: this function never resolves a specific Wix
 * resource (no per-issue network call on a report page), so it cannot
 * know whether a given URL is a Blog Post, Stores Product, or an
 * unsupported Static Page — that proof only exists once
 * resolveWixResource actually runs, at Prepare time. This function only
 * decides whether to show a "Fix available" badge and a Prepare button;
 * Prepare's own 'unavailable' result (including "this looks like a static
 * page, which webioom doesn't support") remains the authoritative answer.
 *
 * H1 and Image Alt are unreachable here: getTitleIssueKind and
 * getMetaDescriptionIssueKind both return null for anything outside
 * title/meta_description issue titles, so this function returns null for
 * every other issue type, exactly mirroring Shopify's own H1/Image Alt
 * exclusion mechanism.
 */
export type WixIssueFixabilityContext = {
  issueTitle: string
  connectionState: IntegrationConnectionState
}

const WIX_FIX_REASON = 'This can be updated directly through your connected Wix site once permissions are confirmed.'

export function evaluateWixIssueFixability(context: WixIssueFixabilityContext): FixabilityResult | null {
  const isTitleIssue = getTitleIssueKind(context.issueTitle) !== null
  const isMetaIssue = !isTitleIssue && getMetaDescriptionIssueKind(context.issueTitle) !== null

  if (!isTitleIssue && !isMetaIssue) {
    return null
  }

  if (context.connectionState === 'not_connected') {
    return {
      level: 'manual',
      reason: `${WIX_FIX_REASON} Connect Wix to let webioom assist with this automatically.`,
      requiresIntegration: true,
    }
  }

  if (context.connectionState === 'needs_attention') {
    return {
      level: 'unavailable',
      reason: 'Your Wix connection needs attention before webioom can assist with this fix.',
      requiresIntegration: true,
    }
  }

  // connectionState === 'connected'. No scope/permission pre-check exists
  // here the way Shopify's does (see docs/wix-api-research.md §8 — Wix's
  // permission model is app-wide, not per-connection-introspectable) —
  // 'assisted' here means only "a connection exists"; the real
  // resource-type and language proof happens at Prepare time, and a
  // genuinely unsupported resource (Static Page, non-primary language)
  // surfaces there as an honest 'unavailable' reason rather than a false
  // promise here.
  return {
    level: 'assisted',
    reason: WIX_FIX_REASON,
    requiresIntegration: true,
  }
}
