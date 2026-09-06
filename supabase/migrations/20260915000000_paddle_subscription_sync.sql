-- Phase 23.2 — Paddle billing integration & subscription lifecycle.
--
-- NOT YET APPLIED to any live Supabase project. Additive only: adds one
-- nullable column to the existing `public.subscriptions` table (approved
-- and already applied in Phase 23.1), one new internal table, and two new
-- functions. Touches no other table, drops nothing, weakens no existing
-- RLS policy.
--
-- WHY A SCHEMA CHANGE WAS GENUINELY NEEDED (Part 10 of the original Phase
-- 23.2 brief, refined by this correction): Paddle documents two distinct,
-- separate concepts for webhook safety — `event_id` for deduplicating
-- retried deliveries of the SAME event, and `occurred_at` for ordering
-- DIFFERENT events. Using only `occurred_at` (the original version of this
-- migration) conflated the two: a retried delivery happened to be safe
-- because retries share the same `occurred_at`, but Paddle's own docs
-- describe scenarios (e.g. resuming a subscription) where multiple
-- DISTINCT events can legitimately share an identical `occurred_at` —
-- which `occurred_at` comparison alone cannot safely order. This
-- correction adds the durable `event_id` record Paddle's own
-- documentation recommends, and introduces an explicit, honest third
-- outcome for the equal-timestamp-different-event case: neither "apply"
-- nor "skip" (both would be a guess), but a request for the caller to
-- fetch Paddle's own authoritative current subscription state and apply
-- THAT — never inventing an arbitrary event-id-ordering tiebreaker Paddle
-- does not document. See docs/paddle-billing.md's "Idempotency, ordering,
-- and reconciliation" section for the full reasoning.

-- ---------------------------------------------------------------------------
-- Event deduplication
-- ---------------------------------------------------------------------------

-- Internal billing infrastructure only — never read or written by
-- anything except the service-role admin client (see
-- lib/paddle/subscription-sync.ts). Deliberately minimal: only the fields
-- genuinely needed to answer "have we already processed this exact
-- event_id" and, for debugging, roughly when/what. No raw Paddle payload
-- is stored here at all.
create table public.paddle_webhook_events (
  event_id text primary key,
  occurred_at timestamptz not null,
  event_type text not null,
  processed_at timestamptz not null default now()
);

comment on table public.paddle_webhook_events is
  'Durable record of every Paddle webhook event_id already processed, existing solely so a retried delivery of the same event can be recognized and skipped (Paddle''s own documented deduplication key). Internal billing infrastructure — no anon/authenticated grant of any kind, exactly like wordpress_connections/shopify_connections/wix_connections. Never stores a raw webhook payload, only the identifiers needed for dedup + light diagnostics.';

-- No RLS policy is added deliberately, on top of revoking every grant:
-- with RLS enabled and zero policies defined, anon/authenticated are
-- denied by default even if a grant were ever added to this table by
-- mistake in the future — the same belt-and-suspenders posture already
-- used for wix_connections/shopify_connections, applied here too since
-- this table has even less reason than those to ever be read by a client.
alter table public.paddle_webhook_events enable row level security;

revoke all on public.paddle_webhook_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ordering column (unchanged from the original version of this migration)
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists last_paddle_event_at timestamptz;

comment on column public.subscriptions.last_paddle_event_at is
  'The occurred_at of the last Paddle event actually applied to this row — either a webhook event''s own occurred_at, or now() at the moment of an authoritative reconciliation fetch (see apply_paddle_subscription_reconciliation). Compared atomically against each incoming event''s own occurred_at so a retried or out-of-order-delivered event can never regress already-applied state. Null for a row that has never been touched by Paddle (e.g. a manually-granted plan, or a user who has never subscribed).';

-- ---------------------------------------------------------------------------
-- Per-event webhook application
-- ---------------------------------------------------------------------------

-- Deliberately SECURITY INVOKER (the default — no SECURITY DEFINER): both
-- functions below are only ever called via the service-role admin client
-- (see lib/paddle/subscription-sync.ts), which already bypasses Row Level
-- Security by Supabase's own design. There is no privilege either
-- function needs that its caller doesn't already have, so there is no
-- reason to introduce a SECURITY DEFINER function's usual escalation
-- risk.
--
-- Race safety: `pg_advisory_xact_lock(hashtext(p_user_id::text))` is
-- taken FIRST, unconditionally, and held for the remainder of this
-- function's transaction. This serializes every call (this function or
-- apply_paddle_subscription_reconciliation) for the SAME user_id, whether
-- or not a subscriptions row already exists for them yet — a plain
-- `SELECT ... FOR UPDATE` would only protect an EXISTING row, leaving a
-- narrow race for a user's very first event; the advisory lock closes
-- that gap too, uniformly, without needing separate first-time/existing-
-- row code paths. The lock is released automatically when the function's
-- transaction ends (success or error) — nothing else in this migration
-- needs to release it explicitly.
--
-- Function-boundary hardening (carried over from the prior correction):
-- fails closed (returns 'rejected') unless `p_billing_provider` is exactly
-- `'paddle'`, and unless every required identity/ordering input is
-- non-null. `p_plan_key`/`p_status` are deliberately NOT re-validated
-- against their full allowed value sets here — `public.subscriptions`'s
-- own `subscriptions_plan_key_check`/`subscriptions_status_check` CHECK
-- constraints already enforce them on the underlying INSERT, so an
-- invalid value (which should never reach this function given
-- lib/paddle/event-mapping.ts's own type-level guarantees) correctly
-- raises a loud constraint-violation exception rather than being silently
-- swallowed as an ordinary skip.
create or replace function public.apply_paddle_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_occurred_at timestamptz,
  p_user_id uuid,
  p_plan_key text,
  p_status text,
  p_billing_provider text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_trial_end timestamptz
) returns text
language plpgsql
as $$
declare
  event_rows_affected integer;
  stored_last_event_at timestamptz;
begin
  if p_billing_provider is distinct from 'paddle' then
    return 'rejected';
  end if;

  if p_event_id is null
     or p_event_occurred_at is null
     or p_user_id is null
     or p_plan_key is null
     or p_status is null
     or p_provider_customer_id is null
     or p_provider_subscription_id is null
  then
    return 'rejected';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Event-id deduplication (Paddle's own documented mechanism for
  -- retried deliveries): if this exact event_id has already been
  -- recorded, this is a duplicate delivery of an event already fully
  -- handled — return immediately, before touching `subscriptions` at all,
  -- regardless of what its occurred_at/status/plan say.
  insert into public.paddle_webhook_events (event_id, occurred_at, event_type)
  values (p_event_id, p_event_occurred_at, p_event_type)
  on conflict (event_id) do nothing;

  get diagnostics event_rows_affected = row_count;
  if event_rows_affected = 0 then
    return 'duplicate';
  end if;

  -- This event_id is now durably recorded as processed — even if the
  -- branches below decide not to touch `subscriptions` (a stale or
  -- equal-timestamp-conflict outcome), a retried delivery of this SAME
  -- event_id will correctly be recognized as 'duplicate' next time, never
  -- re-evaluated as 'stale'/'equal_conflict' again.
  select last_paddle_event_at into stored_last_event_at
  from public.subscriptions
  where user_id = p_user_id;

  if stored_last_event_at is not null and p_event_occurred_at < stored_last_event_at then
    return 'stale';
  end if;

  if stored_last_event_at is not null and p_event_occurred_at = stored_last_event_at then
    -- Two DISTINCT events (different event_id, already proven above) for
    -- the same user sharing an identical occurred_at. Paddle does not
    -- document occurred_at as unique across distinct events, and does not
    -- name a secondary ordering key for this case — event_id exists for
    -- DEDUPLICATION, not for ordering two genuinely different events, so
    -- treating a "larger"/"smaller" event_id as authoritative would be an
    -- invented rule with no documented basis. Rather than guess, this is
    -- reported back as a distinct outcome so the caller
    -- (lib/paddle/subscription-sync.ts) can fetch Paddle's own
    -- authoritative current subscription state and apply that instead
    -- (see apply_paddle_subscription_reconciliation below) — never
    -- silently applying or silently discarding either of the two
    -- conflicting events.
    return 'equal_conflict';
  end if;

  insert into public.subscriptions (
    user_id, plan_key, status, billing_provider, provider_customer_id,
    provider_subscription_id, current_period_end, trial_end,
    last_paddle_event_at, updated_at
  )
  values (
    p_user_id, p_plan_key, p_status, p_billing_provider, p_provider_customer_id,
    p_provider_subscription_id, p_current_period_end, p_trial_end,
    p_event_occurred_at, now()
  )
  on conflict (user_id) do update set
    plan_key = excluded.plan_key,
    status = excluded.status,
    billing_provider = excluded.billing_provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    trial_end = excluded.trial_end,
    last_paddle_event_at = excluded.last_paddle_event_at,
    updated_at = excluded.updated_at;

  return 'applied';
end;
$$;

comment on function public.apply_paddle_subscription_event is
  'Applies one verified Paddle webhook event to a user''s subscriptions row, deduplicated by event_id and ordered by occurred_at, all inside one advisory-locked transaction. Returns exactly one of: rejected (provider/required-field guard failed — see function body), duplicate (this event_id was already processed), stale (occurred_at older than what is already applied), equal_conflict (a DIFFERENT event_id shares the exact occurred_at already applied — caller must reconcile via apply_paddle_subscription_reconciliation, never guess), applied. Called only from lib/paddle/subscription-sync.ts via the service-role admin client.';

-- ---------------------------------------------------------------------------
-- Authoritative reconciliation
-- ---------------------------------------------------------------------------

-- The equal_conflict resolution path: called only after
-- lib/paddle/subscription-sync.ts has independently fetched Paddle's own
-- CURRENT subscription state via `GET /subscriptions/{id}` (never from
-- either of the two conflicting webhook payloads) and re-derived plan/
-- status from that fresh, authoritative response using the exact same
-- trusted price-id mapping and status validation the webhook path uses.
-- Always uses `now()` as the applied event''s effective timestamp — a
-- live fetch is by definition the most current truth available, superior
-- to bookkeeping against either ambiguous event''s own occurred_at, and
-- `now()` is always safely greater than any real (necessarily past)
-- occurred_at already stored, so it can never be treated as stale by a
-- later comparison. No event_id is associated with a reconciliation (it
-- is not itself one specific webhook event), so it does not write to
-- paddle_webhook_events — the event_id(s) that triggered the need for
-- reconciliation were already durably recorded by
-- apply_paddle_subscription_event before this function is ever called.
create or replace function public.apply_paddle_subscription_reconciliation(
  p_user_id uuid,
  p_plan_key text,
  p_status text,
  p_billing_provider text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_trial_end timestamptz
) returns boolean
language plpgsql
as $$
begin
  if p_billing_provider is distinct from 'paddle' then
    return false;
  end if;

  if p_user_id is null
     or p_plan_key is null
     or p_status is null
     or p_provider_customer_id is null
     or p_provider_subscription_id is null
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  insert into public.subscriptions (
    user_id, plan_key, status, billing_provider, provider_customer_id,
    provider_subscription_id, current_period_end, trial_end,
    last_paddle_event_at, updated_at
  )
  values (
    p_user_id, p_plan_key, p_status, p_billing_provider, p_provider_customer_id,
    p_provider_subscription_id, p_current_period_end, p_trial_end,
    now(), now()
  )
  on conflict (user_id) do update set
    plan_key = excluded.plan_key,
    status = excluded.status,
    billing_provider = excluded.billing_provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    trial_end = excluded.trial_end,
    last_paddle_event_at = excluded.last_paddle_event_at,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

comment on function public.apply_paddle_subscription_reconciliation is
  'Applies an authoritative, freshly-fetched Paddle subscription snapshot (GET /subscriptions/{id}), unconditionally superseding whatever ambiguity (equal_conflict) triggered the fetch. Called only from lib/paddle/subscription-sync.ts, only after independently re-validating the fetched subscription''s own custom_data still names the expected user. Records now() as last_paddle_event_at, never an event''s own occurred_at.';

-- ---------------------------------------------------------------------------
-- Ownership boundary for both functions
-- ---------------------------------------------------------------------------

-- Explicit, not merely relying on Postgres's default (which grants
-- EXECUTE on a new function to PUBLIC unless revoked) — mirroring this
-- table's own explicit revoke-then-grant pattern. Even without this,
-- neither anon nor authenticated could actually write through either
-- function today (they have no INSERT/UPDATE grant on public.subscriptions
-- or public.paddle_webhook_events at all), but this makes the boundary
-- explicit rather than incidental.
revoke execute on function public.apply_paddle_subscription_event from public, anon, authenticated;
grant execute on function public.apply_paddle_subscription_event to service_role;

revoke execute on function public.apply_paddle_subscription_reconciliation from public, anon, authenticated;
grant execute on function public.apply_paddle_subscription_reconciliation to service_role;

-- ---------------------------------------------------------------------------
-- Rollback strategy
-- ---------------------------------------------------------------------------

-- `drop function if exists public.apply_paddle_subscription_reconciliation(uuid, text, text, text, text, text, timestamptz, timestamptz);
--  drop function if exists public.apply_paddle_subscription_event(text, text, timestamptz, uuid, text, text, text, text, text, timestamptz, timestamptz);
--  alter table public.subscriptions drop column if exists last_paddle_event_at;
--  drop table if exists public.paddle_webhook_events;`
-- — safe at any point; no other table or function references any of
-- these, and no existing row's other columns are touched by adding a new
-- nullable column or a new, wholly separate table.
