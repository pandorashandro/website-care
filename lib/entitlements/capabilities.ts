import type { PlanEntitlements } from './subscription'

/**
 * Domain-safe failure reasons a Server Action can return to the browser —
 * never a raw DB error, constraint name, or provider detail. Phase 23.3's
 * frontend work is expected to map each of these to its own copy/CTA (e.g.
 * 'website_limit_reached' -> an upgrade prompt), which is why they stay
 * this granular rather than collapsing to one generic "not allowed" string.
 */
export type EntitlementFailureReason =
  | 'not_authenticated'
  | 'website_limit_reached'
  | 'feature_not_in_plan'
  | 'subscription_inactive'

export type EntitlementCheckResult = { allowed: true } | { allowed: false; reason: EntitlementFailureReason }

/**
 * Every capability this module can currently answer for. Deliberately a
 * closed union with no index signature — a new capability requires an
 * explicit addition here AND to isCapabilityAllowed's switch below, so a
 * typo or a not-yet-supported name can never silently resolve to `undefined`
 * being treated as falsy-but-maybe-allowed.
 */
type CapabilityKey = 'manualScansAllowed' | 'aiFixesAllowed' | 'directFixesAllowed' | 'alertsAllowed'

/**
 * Fail-closed by construction, not just by convention: the `default` branch
 * denies rather than falling through to `undefined`/truthy. This matters
 * even though CapabilityKey is a closed TypeScript union, because the value
 * reaching here at runtime could in principle come from a cast
 * (`x as CapabilityKey`) around a value that was never actually validated
 * — see tests/entitlements.test.ts's "unknown capability does not default
 * open" case, which exercises exactly that.
 */
export function isCapabilityAllowed(entitlements: PlanEntitlements, capability: CapabilityKey): boolean {
  switch (capability) {
    case 'manualScansAllowed':
      return entitlements.manualScansAllowed
    case 'aiFixesAllowed':
      return entitlements.aiFixesAllowed
    case 'directFixesAllowed':
      return entitlements.directFixesAllowed
    case 'alertsAllowed':
      return entitlements.alertsAllowed
    default:
      return false
  }
}

/**
 * `subscriptionInactive` (see subscription.ts) is what distinguishes "you
 * never had this feature" from "you used to, and your subscription lapsed"
 * — the same boolean denial gets a more specific, more actionable reason
 * for a user whose plan actually changed under them.
 */
function evaluateCapability(entitlements: PlanEntitlements, capability: CapabilityKey): EntitlementCheckResult {
  if (isCapabilityAllowed(entitlements, capability)) return { allowed: true }
  return { allowed: false, reason: entitlements.subscriptionInactive ? 'subscription_inactive' : 'feature_not_in_plan' }
}

/**
 * Both plans currently allow manual scans (see plans.ts's PLAN_CAPABILITIES)
 * — this exists as the centralized point Phase 24 will tighten once a real
 * scan-frequency/allowance rule is designed, not because any plan is
 * restricted today.
 */
export function evaluateManualScan(entitlements: PlanEntitlements): EntitlementCheckResult {
  return evaluateCapability(entitlements, 'manualScansAllowed')
}

/** Both plans currently allow AI-assisted fixes — same reasoning as evaluateManualScan. */
export function evaluateAiFix(entitlements: PlanEntitlements): EntitlementCheckResult {
  return evaluateCapability(entitlements, 'aiFixesAllowed')
}

/** Both plans currently allow direct fixes — same reasoning as evaluateManualScan. */
export function evaluateDirectFix(entitlements: PlanEntitlements): EntitlementCheckResult {
  return evaluateCapability(entitlements, 'directFixesAllowed')
}

/** Free plan does not allow alerts today — alerts don't exist as a feature yet (Phase 24), so this can never actually deny anything in production yet; it exists so Phase 24 has one place to wire into. */
export function evaluateAlerts(entitlements: PlanEntitlements): EntitlementCheckResult {
  return evaluateCapability(entitlements, 'alertsAllowed')
}

/** Not yet consumed by anything — Phase 24's scheduler is the intended reader. */
export function getMonitoringCadence(entitlements: PlanEntitlements) {
  return entitlements.monitoringCadence
}

/**
 * `currentWebsiteCount` must always be a count the caller derived
 * server-side for this exact authenticated user (e.g. `select count(*)
 * from websites where user_id = <the current session's own id>`) — never a
 * number sourced from the browser. This function itself has no way to
 * verify that; it is the caller's (lib/entitlements/service.ts's)
 * responsibility, documented there.
 */
export function evaluateAddWebsite(entitlements: PlanEntitlements, currentWebsiteCount: number): EntitlementCheckResult {
  if (currentWebsiteCount >= entitlements.maxWebsites) {
    return { allowed: false, reason: 'website_limit_reached' }
  }
  return { allowed: true }
}
