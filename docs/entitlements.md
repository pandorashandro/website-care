# Entitlements (Phase 23.1)

The entitlement engine is webioom's own product-domain answer to "what is this user allowed to do," kept completely independent of any billing provider. It lives in `lib/entitlements/`.

## Plan keys

Exactly three, defined in `lib/entitlements/plans.ts`:

- `'free'` — the default for every user, including everyone who existed before this phase and has no `subscriptions` row at all.
- `'bloom'` — the mid-tier paid plan.
- `'bloom_pro'` — the top-tier paid plan.

There is no generic `'paid'` plan key anywhere in this system — the two-plan (`free`/`paid`) model from Phase 23.1's first draft was corrected before its migration was approved, specifically so webioom would not be locked into a single-paid-plan architecture. Adding a fourth plan later means adding one entry to `PLAN_CAPABILITIES` in `plans.ts` — no consumer of the engine needs to change.

**Prices are not part of this system.** No euro amount, currency, or billing-provider price/product ID appears anywhere in `lib/entitlements/` or the `subscriptions` migration. The current commercial targets (roughly €49/month for Bloom, €99/month for Bloom Pro) are provisional business decisions tracked outside this code, changeable at any time without touching the entitlement engine.

## Plan capabilities (V1 architectural defaults)

| | Free | Bloom | Bloom Pro |
|---|---|---|---|
| `maxWebsites` | 1 | 3 | 10 |
| `monitoringCadence` | `none` | `weekly` | `daily` |
| `alertsAllowed` | `false` | `true` | `true` |
| `manualScansAllowed` | `true` | `true` | `true` |
| `aiFixesAllowed` | `true` | `true` | `true` |
| `directFixesAllowed` | `true` | `true` | `true` |

Manual scans, AI-assisted fixes, and direct fixes are `true` on **every** plan today — this correction did not paywall any already-shipped functionality. The entitlement structure fully supports giving these different values per plan later (each is just one more field to change in `PLAN_CAPABILITIES`); nothing about today's uniform `true` values is hardcoded into the shape of the system.

## Billing provider

**No billing provider is implemented or assumed by this system.** Stripe is explicitly not the assumed provider — the founder is based in Albania, where standard Stripe availability is a problem. Paddle is currently the leading candidate for Phase 23.2, but nothing in `lib/entitlements/` imports from, depends on, or encodes any assumption specific to Paddle (or any other provider). `billing_provider`, `provider_customer_id`, and `provider_subscription_id` on the `subscriptions` table are deliberately generic, nullable columns so whichever provider is ultimately integrated fits the same row shape without a schema change.

## Subscription statuses

Defined in `lib/entitlements/subscription.ts`, aligned to **Paddle's current subscription status lifecycle** (Paddle being the leading billing-provider candidate) rather than a generic or Stripe-shaped status set:

`active`, `trialing`, `past_due`, `paused`, `canceled`.

Note there is no `incomplete`/`incomplete_expired`/`unpaid` in this vocabulary — those were Stripe-specific statuses with no Paddle equivalent, removed once the product decision to target Paddle was made. `paused` is a real Paddle status (no general/Stripe equivalent) that was added for the same reason.

`active`, `trialing`, and `past_due` currently grant the row's own plan entitlements. `paused` and `canceled` do not — both fail closed to the free plan. Anything not in this list at all also fails closed to free.

**`past_due` currently retains access; `paused`/`canceled` do not — but the exact grace-period/end-of-period semantics are explicitly deferred to Phase 23.2.** Today, `past_due` grants the row's plan entitlements immediately and indefinitely (no time limit is applied), which is the current *safe default*, not a finalized billing-lifecycle decision — Paddle's own webhook sequence for a failed payment (and whether webioom should instead cut access at `current_period_end`, apply a fixed grace window, or wait for Paddle to move the subscription to `paused`/`canceled` itself) will be decided in Phase 23.2, once Paddle's actual webhook lifecycle is implemented and observed. `current_period_end` and `trial_end` are already present on `SubscriptionRecord` and the `subscriptions` table specifically so that decision can be implemented later without any schema change.

## Entitlement resolution (fail-closed rules)

`resolveEntitlements(subscription, now?)` in `subscription.ts` is the one function that turns a `subscriptions` row (or its absence) into concrete entitlements. In order:

1. No row → free plan, `subscriptionInactive: false` (this is the *normal* state for most users, not an error).
2. Unrecognized `status` or `plan_key` → free plan, `subscriptionInactive: true`. Never thrown, never upgraded.
3. `paused` or `canceled` → free plan, `subscriptionInactive: true`.
4. `active`, `trialing`, or `past_due` → the row's own `plan_key` (`bloom` or `bloom_pro`) grants entitlements, `subscriptionInactive: false` — see the `past_due` note above for why this is a current default, not a final decision.
5. A `trialing` row whose `trial_end` has already passed → free plan, `subscriptionInactive: true`. This is a defensive check for the gap between a trial actually ending and a webhook updating `status` to reflect it — it does not require Phase 23.2 to be fast or reliable about that update.

`subscriptionInactive` is what lets a denial reason distinguish "you never had this" (`feature_not_in_plan`) from "your subscription lapsed" (`subscription_inactive`) — see `capabilities.ts`'s `evaluateCapability`.

## Server-side enforcement rules

- **Identity is never a parameter.** Every function in `lib/entitlements/service.ts` re-derives the current user from `auth.getUser()` itself — nothing in this engine accepts a `userId` from a caller, so there is no argument through which a forged identity could read or act on someone else's plan.
- **Every check is server-derived.** `canAddWebsite()` counts the current session's own `websites` rows with a fresh Supabase query; nothing is ever trusted from `FormData` or client state.
- **RLS is real, not just application trust.** The `subscriptions` table (migration `20260910000000_subscriptions_foundation.sql`, not yet applied) has an explicit `auth.uid() = user_id` `SELECT` policy and no `INSERT`/`UPDATE`/`DELETE` grant for any authenticated or anon role at all — only a service-role client can ever write a row.
- **A DB read error is treated as "free," never as a paid plan.** If the `subscriptions` query itself fails, `resolveEntitlements(null)` runs — the least-privileged outcome, so a transient error can never accidentally grant a capability.

## What's actually enforced today vs. what's a hook

Only one real restriction exists in production behavior as of Phase 23.1: **`addWebsite` enforces `maxWebsites`** (1 / 3 / 10 for free / Bloom / Bloom Pro — architectural defaults, trivially changed in `plans.ts`).

`canRunManualScan`, `canUseAiFix`, `canUseDirectFix`, and `canReceiveAlerts` all exist as fully-implemented, fully-tested hooks, but:

- `manualScansAllowed`, `aiFixesAllowed`, and `directFixesAllowed` are `true` for **all three** plans today — preserving every existing user's current behavior exactly. `scanWebsite` already calls `canRunManualScan()`, so the call site exists, but it can never actually deny a scan until `plans.ts` changes.
- `canUseAiFix`/`canUseDirectFix` are **not yet wired into any WordPress/Shopify/Wix fix-action call site** — deliberately, to avoid touching ~10 already-shipped, already-tested fix-action files for a check that would be a no-op today. Wiring them in is a later phase's decision, once these capabilities actually need to differ by plan.
- `alertsAllowed` is `false` for free and `true` for Bloom/Bloom Pro, but nothing in the product sends an alert yet — this only matters once Phase 24 builds that feature.
- `monitoringCadence` (`none` / `weekly` / `daily`) is not read by anything yet — it exists purely so Phase 24's scheduler has a field to consume from day one.

## Website-limit race handling

Two concurrent `addWebsite` calls (a double submit, two open tabs) can both pass the pre-insert `canAddWebsite()` check before either commits. `addWebsite` re-verifies with `verifyWebsiteCountAfterInsert()` immediately after the insert and deletes its own just-inserted row if the limit was exceeded. In the rare case both requests genuinely race, both may independently observe the limit as exceeded and both self-reject — the accepted failure mode is "occasionally has to retry once," never "silently exceeds the limit." No database-level lock or serializable transaction was introduced for this; it was judged unnecessary for V1's expected contention level.

## How Phase 23.2 (billing provider) should update subscription state

Phase 23.2 is expected to add exactly one new writer: a webhook handler using the service-role admin client (mirroring `wordpress_connections`/`shopify_connections`/`wix_connections`'s existing pattern) that upserts a `subscriptions` row keyed on `user_id`, setting `plan_key` (`bloom` or `bloom_pro` — never a raw provider price/product ID), `status`, `billing_provider`, `provider_customer_id`, `provider_subscription_id`, `current_period_end`, and `trial_end` from the provider's own webhook payload — translated into this table's product-domain `status` vocabulary, not passed through as raw provider enum values. Phase 23.2 must also make the cancellation/grace-period decision described above once the chosen provider's actual lifecycle is known. No other part of the entitlement engine needs to change; `resolveEntitlements` already handles every status this table's check constraint allows.

## How Phase 24 (monitoring) should consume monitoring cadence

Call `getCurrentUserMonitoringCadence()` (or `getMonitoringCadence(entitlements)` if entitlements were already resolved for another reason in the same request) to decide how often a given user's websites should be scheduled for an automatic scan. `'none'` means no automatic scan should ever be scheduled for that user today — every current user resolves to `'none'` unless a real Bloom or Bloom Pro subscription exists.

## Fail-closed summary

Every unknown or malformed input in this system resolves toward **less** access, never more: unknown plan → free. Unknown status → free. Lapsed trial → free. DB read error → free. Unknown capability key → denied. There is no code path in `lib/entitlements/` where an unrecognized value results in elevated access.
