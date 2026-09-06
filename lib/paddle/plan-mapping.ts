/**
 * Phase 23.2 — the one trusted, bidirectional mapping between webioom's
 * own plan keys and Paddle's price IDs. Deliberately pure (no env read, no
 * network, no 'server-only') so both directions are fully unit-testable
 * with a synthetic mapping — the real, env-derived mapping only ever
 * enters through lib/paddle/config.ts's getPaddlePriceMapping, consumed by
 * server-only callers.
 */
export type PaddlePlanKey = 'bloom' | 'bloom_pro'

export type PaddlePriceMapping = {
  bloom: string | null
  bloom_pro: string | null
}

/**
 * webioom plan -> configured Paddle price ID, for building a checkout.
 * `free` is not a valid input here at all (there is no type for it) — a
 * checkout is only ever meaningful for a paid plan. A paid plan with no
 * configured price ID (missing/blank environment variable) returns `null`
 * — the caller must fail the checkout request closed, never fall back to
 * a different plan's price or proceed with an empty/guessed price ID.
 */
export function resolvePaddlePriceId(plan: PaddlePlanKey, mapping: PaddlePriceMapping): string | null {
  return mapping[plan] ?? null
}

/**
 * The ONLY trusted way to determine which webioom plan a Paddle
 * subscription is actually on. A webhook's own event/payload never
 * carries a webioom plan label to trust directly — only a Paddle price ID,
 * which this function reverse-looks-up against the exact same mapping
 * resolvePaddlePriceId uses, so the two directions can never drift apart
 * from each other. An unrecognized price ID — unconfigured, stale, or a
 * Paddle price created in the dashboard but never wired to a plan via
 * environment variables — returns `null`. Every caller MUST treat `null`
 * as "grant no paid entitlements for this event," never guess the
 * nearest/cheapest/most-recently-added plan.
 */
export function derivePlanFromPriceId(priceId: string, mapping: PaddlePriceMapping): PaddlePlanKey | null {
  if (mapping.bloom && priceId === mapping.bloom) return 'bloom'
  if (mapping.bloom_pro && priceId === mapping.bloom_pro) return 'bloom_pro'
  return null
}

/**
 * The one place a browser-submitted plan key (e.g. from a checkout form)
 * is validated before ever being used to look up a price. Lives here —
 * not in the 'use server' action file that calls it
 * (app/dashboard/billing-actions.ts) — because Next.js requires every
 * export of a 'use server' file to be an async Server Action; a plain
 * synchronous guard like this must never live there (this exact class of
 * bug broke a production build during the Wix integration once a client
 * component started importing that file — see docs/paddle-billing.md).
 */
export function isPaddlePlanKey(value: string): value is PaddlePlanKey {
  return value === 'bloom' || value === 'bloom_pro'
}
