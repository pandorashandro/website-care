-- Phase 23.1 — Plans & Entitlements Foundation.
--
-- NOT YET APPLIED to any live Supabase project. Prepared per this phase's
-- explicit instruction: additive only, no destructive changes, no
-- modification to any existing table.
--
-- One row per user, holding the current commercial/subscription state the
-- entitlement engine (lib/entitlements/) resolves into plan capabilities.
-- Most users are expected to have NO row at all — see
-- lib/entitlements/subscription.ts's resolveEntitlements, which treats a
-- missing row as the normal default-free state, not an error. A row is only
-- ever expected to be created once a user starts a paid (Bloom or Bloom
-- Pro) subscription (Phase 23.2's billing-provider webhook will be the
-- sole writer).
--
-- Provider-neutral by design: `billing_provider`/`provider_customer_id`/
-- `provider_subscription_id` are nullable, generic columns, not tied to any
-- specific provider's naming, so whichever provider Phase 23.2 actually
-- integrates (Paddle is the current leading candidate — the founder is
-- based in Albania, where standard Stripe availability is a problem; no
-- provider has been selected yet) fits the same row shape. `plan_key` and
-- `status` are webioom's own product-domain vocabulary — never a raw
-- billing-provider price/product ID, and never a price or currency value at
-- all — see docs/entitlements.md.

-- Plain `create table`, not `create table if not exists`: this migration
-- has never been applied to any live project, so there is no legitimate
-- pre-existing `public.subscriptions` table it could ever need to
-- tolerate — an unexpected table already existing under this name should
-- fail the migration loudly rather than silently skip creating it.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- One row per user in V1 — see this phase's brief ("one active
  -- subscription per user for V1"). A user upgrading providers or plans
  -- later still updates this same row; it is never expected to multiply.
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_key text not null default 'free',
  status text not null default 'active',
  -- Null until Phase 23.2 connects a real billing provider. Deliberately
  -- generic (not a `stripe_customer_id`/`paddle_customer_id` column) so a
  -- future provider — or a manually-granted plan with no provider at all —
  -- fits the same row shape without a schema change. No Paddle-specific
  -- customer/product/price ID column exists yet, deliberately, per this
  -- phase's brief — these three generic columns are enough until Phase
  -- 23.2 actually integrates a provider.
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_key_check check (plan_key in ('free', 'bloom', 'bloom_pro')),
  -- Aligned to Paddle's current subscription status lifecycle (the leading
  -- billing-provider candidate) rather than a generic/Stripe-shaped status
  -- set. `incomplete`/`incomplete_expired`/`unpaid` (Stripe-specific
  -- statuses with no Paddle equivalent) were deliberately removed; `paused`
  -- (a real Paddle status with no free/general equivalent) was added.
  constraint subscriptions_status_check check (status in ('active', 'trialing', 'past_due', 'paused', 'canceled'))
);

comment on table public.subscriptions is
  'One commercial/subscription state row per user. Missing row = default free plan (see lib/entitlements/subscription.ts), never an error. plan_key/status are webioom''s own product-domain vocabulary; provider_* columns are reserved, nullable, and provider-neutral for Phase 23.2''s billing integration.';

comment on column public.subscriptions.plan_key is
  'webioom''s own plan identity (''free'' | ''bloom'' | ''bloom_pro''), never a raw billing-provider price/product ID and never a price or currency value. See lib/entitlements/plans.ts''s PlanKey.';

comment on column public.subscriptions.status is
  'webioom''s own subscription-lifecycle vocabulary, aligned to Paddle''s current subscription status lifecycle so Phase 23.2 can map webhook payloads through with little to no translation. active/trialing/past_due currently grant the row''s plan (past_due''s grace-period/current_period_end semantics are a Phase 23.2 decision, not yet finalized); paused/canceled do not. See lib/entitlements/subscription.ts''s resolveEntitlements.';

-- Ownership boundary: RLS is the real enforcement here, not merely
-- application-level trust (per this phase's explicit instruction) — a
-- user may read only their own row, and no role is ever granted
-- insert/update/delete, so even if a future client-side feature queries
-- this table directly, only the service-role admin client (used from
-- lib/entitlements/service.ts, after independently confirming the current
-- session via auth.getUser()) can ever write to it. This is intentionally
-- stronger than the wordpress_connections/shopify_connections/
-- wix_connections precedent (zero grants at all) because this table's
-- contents (plan name, status) are safe to expose read-only to their own
-- owner, unlike a credential.
alter table public.subscriptions enable row level security;

revoke all on public.subscriptions from public, anon, authenticated;

grant select on public.subscriptions to authenticated;

create policy "subscriptions_select_own" on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policy is created for authenticated or anon:
-- with no grant and no policy, every write attempt from either role is
-- rejected at the privilege-check stage before RLS is even evaluated. All
-- writes happen exclusively through the service-role admin client, which
-- bypasses RLS by design and is reached only from
-- lib/entitlements/service.ts today (no writer exists yet — Phase 23.2's
-- billing-provider webhook will be the first).

-- Rollback strategy: this table is new and additive, and nothing else
-- references it (no foreign key from any existing table points here).
-- Reverting this migration is a plain `drop table if exists
-- public.subscriptions;` — safe at any point before real subscription rows
-- exist, and safe afterward too in the sense that no other table's data or
-- schema is touched by dropping it (removing it only returns every user to
-- the default-free resolution path, which is already the behavior for
-- every user with no row today).
