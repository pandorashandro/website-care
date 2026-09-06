# Paddle Billing (Phase 23.2)

The backend integration with Paddle Billing — checkout creation, webhook-driven subscription sync, and customer portal sessions — kept entirely separate from webioom's own provider-neutral entitlement engine (`lib/entitlements/`, Phase 23.1). Nothing in `lib/entitlements/` imports from or depends on Paddle; `lib/paddle/` is the only layer that knows Paddle exists.

## Environment variables

Added to `.env.example` (no real values committed):

| Variable | Purpose |
|---|---|
| `PADDLE_API_KEY` | Server-side Bearer token for Paddle's REST API. Sandbox and live keys are not interchangeable. |
| `PADDLE_ENVIRONMENT` | `sandbox` or `production` — selects the API base URL and which key is valid. |
| `PADDLE_WEBHOOK_SECRET` | The notification destination's own secret (configured manually in the Paddle dashboard), used only to verify the `Paddle-Signature` header. A different value from `PADDLE_API_KEY`. |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Public client-side token for Paddle.js. Deliberately public — carries no write access on its own. |
| `PADDLE_BLOOM_PRICE_ID` / `PADDLE_BLOOM_PRO_PRICE_ID` | The Paddle price ID (`pri_...`) for each paid plan, per environment. `free` intentionally has none. |

## Sandbox vs. live

Paddle sandbox and live are separate accounts with separate credentials, base URLs (`sandbox-api.paddle.com` vs `api.paddle.com`), products/prices, customers, and notification destinations — nothing is shared. `lib/paddle/config.ts`'s `getPaddleConfig()` selects the base URL from `PADDLE_ENVIRONMENT` and throws if it isn't exactly `"sandbox"` or `"production"`.

## Plan → price mapping

`lib/paddle/plan-mapping.ts` is the single trusted, bidirectional mapping:

- `resolvePaddlePriceId(plan, mapping)` — webioom plan → Paddle price ID, used to build a checkout. Only accepts `'bloom'` or `'bloom_pro'` at the type level; there is no way to ask it for a `'free'` price.
- `derivePlanFromPriceId(priceId, mapping)` — Paddle price ID → webioom plan, used when processing a webhook. **This is the only way a plan is ever assigned from provider data** — a webhook's own payload is never trusted to name a plan directly. An unrecognized price ID returns `null`; the caller must grant no paid entitlements, never guess the nearest or cheapest plan.

The mapping itself (`lib/paddle/config.ts`'s `getPaddlePriceMapping()`) is read fresh from environment variables on every call — never cached, never hardcoded in source.

## Checkout backend

`app/dashboard/billing-actions.ts`'s `createCheckoutForPlan`:

1. Requires an authenticated session.
2. Accepts only a plan **key** (`'bloom'` | `'bloom_pro'`) from the browser via `isPaddlePlanKey` — never a price ID, customer ID, or subscription ID.
3. Resolves the price ID server-side via `resolvePaddlePriceId`.
4. Creates a Paddle **transaction** (`lib/paddle/client.ts`'s `createPaddleTransaction`) with `custom_data: { webioom_user_id: <this session's own user id> }` set server-side — never client-suppliable — and reuses this user's existing Paddle customer (read from their own `subscriptions.provider_customer_id`) if one already exists.
5. Returns only the transaction id and checkout URL — the minimal data a future frontend needs to open Paddle.js's checkout overlay via `transactionId` (not a client-side `items`/`customData` call, which would let the browser set its own `custom_data`).

No pricing or checkout UI exists yet — this is backend only, per this phase's explicit scope.

## Customer identity binding

The **only** trusted link between a Paddle subscription and a webioom user is `custom_data.webioom_user_id`, set once, server-side, at transaction-creation time (step 4 above). Paddle copies `custom_data` from a transaction to the subscription it creates, and to every subsequent transaction on that subscription (renewals, etc.) — so every later webhook for that subscription carries the same trusted value. Customer email is never used as an authorization boundary.

## Webhook route

`app/api/webhooks/paddle/route.ts` (`POST /api/webhooks/paddle`). Not registered as a Paddle notification destination automatically — **configure this URL manually in the Paddle dashboard after deployment** (see "Manual Paddle dashboard steps" below).

Trust order, mirroring the existing Shopify webhook route: read the raw body, verify `Paddle-Signature` **before reading any other field** of the payload, then parse. No provider secret is ever logged.

## Signature verification

`lib/paddle/webhook-signature.ts`, per developer.paddle.com's documented algorithm: header format `ts=<unix_seconds>;h1=<hex>`, signed payload `${ts}:${rawBody}`, HMAC-SHA256, hex digest, timing-safe comparison.

**Timestamp tolerance is 5 seconds — Paddle's own documented default**, quoted directly from developer.paddle.com: "The default tolerance between the timestamp and the current time is five seconds." An earlier draft of this integration widened this to 5 minutes on the theory that serverless delivery latency might exceed 5 seconds; that was corrected before approval — deviating from a payment provider's documented replay-protection window is a security decision this codebase does not make on its own authority in place of the provider's own recommendation, and doing so without flagging it explicitly as a security-relevant change would have been worse still. If production experience later shows legitimate webhooks are being rejected under this tolerance, that is an operational finding to bring back for an explicit decision, not something to pre-empt by quietly loosening verification here.

## Event mapping

`lib/paddle/event-mapping.ts`:

- `parsePaddleSubscriptionEventData` safely narrows the webhook's `data` field, requiring `id`, `customer_id`, `status`, and a well-formed `items` array; anything else returns `null` rather than throwing or guessing.
- `mapPaddleStatus` validates Paddle's raw status string against exactly webioom's own five-value `SubscriptionStatus` vocabulary (`active`/`trialing`/`past_due`/`paused`/`canceled`) — chosen to already match Paddle's own subscription statuses (confirmed against developer.paddle.com), but still explicitly validated rather than blindly cast, so an unrecognized future Paddle status fails closed.
- `mapPaddleSubscriptionEvent` combines the above with `derivePlanFromPriceId` into one fully-formed, trusted subscription-state update, or a specific failure reason (`missing_user_id` / `unknown_status` / `unknown_price`).

## Plan derivation from provider data

Never trust a webhook-supplied plan label. `mapPaddleSubscriptionEvent` always derives the plan from `data.items[0].price.id` via `derivePlanFromPriceId`. An unknown price ID fails the whole event closed (`unknown_price`) — it never grants Bloom, Bloom Pro, or any plan by default.

## Idempotency, ordering, and reconciliation

Paddle's own documentation draws a clear, deliberate line between two separate concerns, and this integration follows that line exactly:

- **`event_id` is for deduplication.** Paddle guarantees at-least-once delivery — the same event can arrive more than once (retries on failure/timeout) — and its own guidance is to use `event_id` as the deduplication key so a retried delivery never double-applies.
- **`occurred_at` is for ordering.** Paddle's guidance is to reason about event order using `occurred_at` (when the event actually happened), never arrival time, since delivery can be out of sequence.

An earlier draft of this migration used only `occurred_at` comparison and treated a retried delivery as "safe because it happens to carry the same timestamp as the original" — which conflated the two concerns. This correction adds the durable `event_id` record Paddle's guidance actually calls for, and gives ordering its own honest third outcome for the one case neither concept alone resolves.

**`public.paddle_webhook_events`** (new table, this migration): `event_id text primary key`, `occurred_at timestamptz not null`, `event_type text not null`, `processed_at timestamptz not null default now()`. Internal billing infrastructure only — RLS enabled with zero policies plus an explicit revoke-all from `anon`/`authenticated`, mirroring `wordpress_connections`/`shopify_connections`/`wix_connections`. No raw webhook payload is ever stored here.

**`subscriptions.last_paddle_event_at`** (unchanged from the original version of this migration): the `occurred_at` of the last Paddle-originated write actually applied to that row — either a webhook event's own `occurred_at`, or `now()` at the moment of a reconciliation fetch (below).

**`apply_paddle_subscription_event`** (the function called for every webhook event) does both checks in one advisory-locked transaction (`pg_advisory_xact_lock(hashtext(user_id))`, serializing every call for the same user so no read-then-write race is possible even for a user's very first event) and returns exactly one of:

| Outcome | Meaning |
|---|---|
| `rejected` | Provider ≠ `'paddle'`, or a required field was null — should never happen given `lib/paddle/`'s own type guarantees; defense-in-depth only. |
| `duplicate` | This exact `event_id` was already recorded — Paddle's documented retry case. Nothing is re-applied. |
| `stale` | `occurred_at` is strictly older than what's already applied — an out-of-order late delivery. Nothing is applied. |
| `equal_conflict` | A **different** `event_id` (already proven — same `event_id` short-circuits to `duplicate` first) shares the exact `occurred_at` already applied. See reconciliation below. |
| `applied` | The event was newer than what was already applied; the row was updated. |

**Equal-timestamp, different-event reconciliation.** Paddle's docs confirm this case is real — some actions ("resuming a subscription," specifically) typically emit multiple distinct events together, which "could potentially share the same `occurred_at` timestamp" — but name no secondary ordering key for it; `event_id` is documented only for deduplication, never as a tiebreaker between two genuinely different events. **Inventing an arbitrary event-ID-based ordering rule here (e.g. "the lexicographically later event_id wins") would have no documented basis and was deliberately not done.** Instead, on `equal_conflict`, `lib/paddle/subscription-sync.ts`'s `applyPaddleSubscriptionEvent` calls `reconcilePaddleSubscription`, which:

1. Fetches Paddle's own **current, authoritative** subscription state via `GET /subscriptions/{id}` (confirmed to return the identical shape a webhook's `data` field does — status, `items[].price.id`, `current_billing_period.ends_at`, `items[].trial_dates.ends_at`, `custom_data`).
2. Re-derives plan/status from that fresh response through the exact same `parsePaddleSubscriptionEventData`/`mapPaddleSubscriptionEvent` pipeline a webhook uses (`reconcileSubscriptionSnapshot` in `lib/paddle/event-mapping.ts` — a pure function, permanently tested).
3. **Independently cross-checks** the fetched snapshot's own `custom_data.webioom_user_id` against the user id already trusted from the original webhook event. A mismatch (or no `custom_data` at all) fails the whole reconciliation closed — a successful API response for the requested subscription id is not, by itself, proof this is still the right user's subscription. This is the "authoritative reconciliation cannot trust a single, uncorroborated input" guarantee.
4. Applies the result via `apply_paddle_subscription_reconciliation` (a second, narrower Postgres function — same provider/null guards, same advisory lock, unconditional apply since a live fetch is definitionally the most current truth available), recording `now()` — not either ambiguous event's own `occurred_at` — as the new `last_paddle_event_at`.

A live fetch resolving this ambiguity is more trustworthy than guessing between two conflicting webhook payloads, and is the resolution path Paddle's own subscription API makes safely available (`subscription.read` permission, standard API key scope).

**`p_plan_key`/`p_status` are deliberately not re-validated inside either Postgres function** — `public.subscriptions`'s own `subscriptions_plan_key_check`/`subscriptions_status_check` CHECK constraints already enforce them on the underlying `INSERT`, so an invalid value (which should never reach either function given `lib/paddle/event-mapping.ts`'s own type-level guarantees) correctly raises a loud constraint-violation exception rather than being silently swallowed as an ordinary skip.

## Cancellation, past_due, and pause semantics

Research against developer.paddle.com resolved the ambiguity this phase's brief raised: **Paddle's own `status` field already encodes the correct grace-period timing.** Canceling a subscription with `effective_from: "next_billing_period"` (Paddle's default) creates a *scheduled* change — `status` stays `active` until the scheduled date, and Paddle only sends the `canceled` webhook once that date actually arrives. The same is true for pausing. This means webioom's webhook handler does not need to implement its own grace-period logic at all: by simply mirroring whatever `status` Paddle reports, whenever it reports it, the existing entitlement semantics are already correct —

- `active` → named plan entitlements
- `trialing` → named plan entitlements
- `past_due` → named plan entitlements **for now** (see below)
- `paused` → free (Paddle only reports this once the pause has actually taken effect)
- `canceled` → free (Paddle only reports this once the cancellation has actually taken effect)

**`past_due` retaining access indefinitely remains a deliberate, disclosed V1 default, not a finalized decision.** Whether webioom should instead cut access once `current_period_end` passes while `past_due`, or wait for Paddle to move the subscription to `canceled`/`paused` itself (Paddle's own dunning process does this automatically after repeated failed retries), is left for a future phase once real `past_due` behavior has been observed in sandbox/live testing. No grace-period logic not supported by provider data was invented.

## Customer portal backend

`app/dashboard/billing-actions.ts`'s `createBillingPortalSession`:

1. Requires an authenticated session.
2. Reads `provider_customer_id` from **this session's own** `subscriptions` row only — accepts no customer ID argument from the browser at all.
3. Fails closed with `no_paid_customer` if no customer ID is on file (never subscribed, or a row that predates any successful webhook).
4. Calls `POST /customers/{customer_id}/portal-sessions` and returns only `urls.general.overview` — the single-use, short-lived portal URL. No billing settings UI exists yet.

## Manual Paddle dashboard steps still required

1. Create the `WEBIOOM Bloom` and `WEBIOOM Bloom Pro` products/prices in both sandbox and (later) live Paddle accounts, and set `PADDLE_BLOOM_PRICE_ID`/`PADDLE_BLOOM_PRO_PRICE_ID` accordingly per environment.
2. Generate a sandbox API key (Developer tools > Authentication) and set `PADDLE_API_KEY`/`PADDLE_ENVIRONMENT=sandbox`.
3. Generate a client-side token and set `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
4. **After this backend is deployed to an environment with a public URL**, create a notification destination in the Paddle dashboard pointing at:

   ```
   https://<your-deployed-domain>/api/webhooks/paddle
   ```

   Subscribe it to at least: `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`. Copy the generated secret into `PADDLE_WEBHOOK_SECRET`.
5. Repeat steps 1–4 for the live account when ready to accept real payments (this phase implements no live-specific code path — the same code serves both environments based on `PADDLE_ENVIRONMENT`).

## Live sandbox testing still required

None of the following can be verified by permanent Vitest tests and must be exercised against a real Paddle Sandbox account before this integration is considered production-ready:

- A full checkout completes and a `subscription.activated` (or `subscription.trialing`, if a trial is configured) webhook actually arrives, verifies, and updates the `subscriptions` row.
- The webhook signature verification accepts a *real* Paddle-signed request (this phase's tests only sign synthetic payloads with a synthetic secret).
- Canceling a subscription in the Paddle dashboard/portal with each `effective_from` option produces the expected `status` timing described above.
- Pausing and resuming a subscription.
- Forcing a failed payment to observe real `past_due` behavior and however many retry attempts Paddle actually makes before moving to `canceled`.
- The customer portal session URL actually opens Paddle's hosted portal for a real customer.
- Confirming Paddle's actual webhook retry behavior (backoff timing, maximum attempts) against this endpoint's 200/401/400/500 responses.
- Whether two distinct subscription events sharing an identical `occurred_at` actually occur in practice, and — if so — that the `equal_conflict` → reconciliation path correctly resolves them (this requires either observing it naturally or deliberately engineering a near-simultaneous pair of subscription changes in sandbox).
- That the reconciling `GET /subscriptions/{id}` call succeeds with the configured API key's permissions (`subscription.read`).

## Fail-closed summary

Unknown price → no paid plan. Unknown status → event rejected, nothing applied. Missing/non-string `custom_data.webioom_user_id` → event rejected, nothing applied. Invalid or missing webhook signature → 401, nothing read from the body. Malformed/missing `event_id` → 400, nothing processed. Duplicate `event_id` → skipped, nothing re-applied. Stale/out-of-order event → skipped, nothing overwritten. Equal-timestamp conflict with no resolvable authoritative snapshot (fetch failure, unmapped price/status, or a user-id mismatch on the fetched data) → `reconciliation_failed`, nothing applied, 500 (so Paddle retries). No code path in `lib/paddle/` results in elevated access from unrecognized or unverified input.
