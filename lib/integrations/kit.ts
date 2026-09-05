/**
 * ============================================================================
 * webioom Integration Kit (Phase 21)
 * ============================================================================
 *
 * This file is a single, deliberately small ENTRY POINT re-exporting the
 * webioom concepts that are genuinely proven reusable by BOTH current
 * platform integrations (WordPress and Shopify) — nothing here is new
 * logic, and nothing here is speculative. Every symbol below already
 * existed before Phase 21; this file only gives them one discoverable
 * front door for whoever builds the next integration (see
 * docs/integration-kit.md for the full "how to add a platform" guide this
 * file is the code-level companion to).
 *
 * WHAT COUNTS AS "THE KIT" (and why each piece earned its place):
 *
 * - PlatformType / INTEGRATION_REGISTRY / INTEGRATIONS
 *   (lib/integrations/platform.ts, lib/integrations/registry.ts)
 *   The identity + discovery layer. `Record<PlatformType, ...>` is used
 *   throughout the codebase specifically so adding a platform to this union
 *   is a compile-time-enforced checklist (registry entry, card renderer,
 *   rollback-compatibility decision) rather than something that can be
 *   silently forgotten.
 *
 * - IntegrationConnectionState / IntegrationCapabilityState /
 *   RequiredIntegrationCapability / IntegrationCapabilitySnapshot
 *   (lib/integrations/platform.ts)
 *   The smallest normalized "is this platform usable right now" vocabulary
 *   lib/fixes/fixability.ts actually consumes. Both platforms' own
 *   connection-status modules (wordpress-capabilities.ts's
 *   toIntegrationFixabilityInputs, shopify-connection-status.ts's
 *   toShopifyIssueFixabilityInputs) independently converge on producing
 *   this same shape from their own, completely different native connection
 *   models — that convergence is what proves it, not a shared function.
 *
 * - FixabilityLevel / FixabilityResult / evaluateFixability
 *   (lib/fixes/fixability.ts)
 *   The webioom-level "can we assist with this issue" engine. WordPress
 *   drives it directly. Shopify does NOT call it — Shopify's capability
 *   model is resource-type-and-scope-shaped in a way the two-key
 *   IntegrationCapabilitySnapshot cannot represent, so
 *   lib/integrations/shopify/issue-fixability.ts is its own, separate
 *   evaluator — but it still returns the exact same FixabilityResult type,
 *   which is what lets report-helpers.ts/issue-group.tsx render either
 *   platform's answer through one code path. This is the intended
 *   pattern: share the RESULT type, never force a shared EVALUATOR when
 *   the input models genuinely differ.
 *
 * - PublicVerificationStatus (lib/fixes/verification-status.ts)
 *   The shared verified/pending/mismatch/unavailable vocabulary every
 *   current verifier (WordPress: title/meta/H1/image-alt apply, title/meta/
 *   H1 rollback; Shopify: apply+undo, shared) either equals, is a subset
 *   of, or extends. See that file's own doc comment for the full picture,
 *   including the one legitimate extension (WordPress title/meta's
 *   'still_detected').
 *
 * WHAT IS DELIBERATELY *NOT* HERE, AND WHY (see docs/integration-kit.md
 * §5 for the full reasoning per item):
 *
 * - No generic `IntegrationAdapter` interface. Each platform's own
 *   adapter/orchestration files (lib/integrations/wordpress/adapter.ts,
 *   the Shopify equivalents under lib/integrations/shopify/ and
 *   app/dashboard/websites/[id]/shopify-*.ts) are the adapter — there is
 *   no abstract base class or interface they implement, because
 *   authentication, resource resolution, mutation mechanics, and
 *   concurrency protection are NOT the same shape across platforms
 *   (numeric WordPress post/page IDs vs. Shopify GIDs; WordPress REST
 *   Application Passwords vs. Shopify OAuth; metafield compareDigest vs.
 *   no equivalent primitive at all) and forcing a shared interface over
 *   them would either lie about that or produce an interface so wide it
 *   adds no safety.
 * - No generic `write(field, value)` mutation function, on either
 *   platform. Every fix family has its own dedicated writer
 *   (updateWordPressTitle, updateShopifyProductTitle, etc.) — this is a
 *   security invariant (see docs/integration-kit.md §11), not an
 *   oversight.
 * - No shared ResourceIdentity type is exported here. fix_history's
 *   resource_id/resource_gid column pair (with a DB-level CHECK
 *   constraint enforcing exactly one is set per platform — see
 *   supabase/migrations/20260901000000_shopify_fix_history.sql) already
 *   models "each platform has its own resource identity shape, unified
 *   only at the storage layer" correctly; adding a parallel TypeScript
 *   union that nothing imports would be speculative, not proven.
 * - No shared rollback-eligibility function. WordPress's
 *   isRollbackEligibleByShape and Shopify's isShopifyRollbackEligibleByShape
 *   (app/dashboard/websites/[id]/fix-history.ts) are deliberately separate
 *   — their resource_type vocabularies collide on the literal string
 *   'page' (a WordPress Page and a Shopify Page are unrelated resources),
 *   and every caller must branch on `platform` FIRST, before either
 *   function is even reachable. A shared function would either hide that
 *   branch (dangerous) or need the exact same branch inside it (no benefit
 *   over two named functions).
 */

export type {
  PlatformType,
  FixHistoryPlatform,
  IntegrationConnectionState,
  IntegrationCapabilityState,
  RequiredIntegrationCapability,
  IntegrationCapabilitySnapshot,
} from './platform'

export type { IntegrationRegistryEntry } from './registry'
export { INTEGRATION_REGISTRY, INTEGRATIONS } from './registry'

export type { FixabilityLevel, FixabilityResult, FixabilityContext } from '@/lib/fixes/fixability'
export { evaluateFixability } from '@/lib/fixes/fixability'

export type { PublicVerificationStatus } from '@/lib/fixes/verification-status'
