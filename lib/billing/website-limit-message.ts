import type { EntitlementFailureReason } from '@/lib/entitlements/capabilities'
import type { PlanKey } from '@/lib/entitlements/plans'
import { PLAN_PRESENTATION } from './plan-presentation'

export type WebsiteLimitUpgradeMessage = { message: string; showUpgradeLink: boolean }

/**
 * Turns an `addWebsite` entitlement denial into a commercially useful
 * message, without ever weakening `canAddWebsite`'s own server-side
 * enforcement (`lib/entitlements/service.ts`) — this function only
 * decides what the ALREADY-DENIED user sees; it has no way to grant
 * anything. `currentPlan` is used only to phrase the specific limit
 * number and plan name (e.g. "the 1 website limit on Free") — never to
 * decide whether the denial itself was correct, which the server already
 * settled before this message is ever shown.
 */
export function getWebsiteLimitUpgradeMessage(reason: EntitlementFailureReason, currentPlan: PlanKey): WebsiteLimitUpgradeMessage {
  if (reason !== 'website_limit_reached') {
    return { message: '', showUpgradeLink: false }
  }

  const presentation = PLAN_PRESENTATION[currentPlan]
  const websiteWord = presentation.maxWebsites === 1 ? 'website' : 'websites'

  return {
    message: `You've reached the ${presentation.maxWebsites} ${websiteWord} limit on ${presentation.name}.`,
    showUpgradeLink: currentPlan !== 'bloom_pro',
  }
}
