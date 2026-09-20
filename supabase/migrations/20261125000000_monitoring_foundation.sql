-- Sprint 2, Prompt 1 — MONITORING FOUNDATION.
--
-- This migration adds ONLY the domain schema this prompt's own explicit
-- scope calls for: per-website monitoring PREFERENCES (enabled/disabled,
-- cadence, which scan monitoring last considered, when the next one is
-- conceptually due, and a notification preference placeholder). It does
-- NOT add any scheduler, queue, cron, or email-delivery infrastructure —
-- those are explicitly deferred to a future prompt. No existing table is
-- altered; no existing score/finding/crawl table is touched.
--
-- Historical comparison itself (Sprint 2, Prompt 1's main deliverable)
-- needs NO new table at all: crawl_runs/crawl_analyses/every finding table
-- already persist one immutable row per crawl_run_id forever (a new scan
-- always creates a brand-new crawl_run — see lib/crawler/engine.ts's
-- startCrawlRun — and nothing in this codebase ever deletes or overwrites
-- a terminal one), so a "historical snapshot" is simply a query against
-- already-persisted data for a specific past crawl_run_id
-- (app/dashboard/websites/[id]/scan-history.ts). This table is the ONLY
-- genuinely new persisted concept this sprint requires.

create table public.website_monitoring_settings (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null unique references public.websites(id) on delete cascade,

  -- The customer's own choice to turn recurring monitoring on at all.
  -- Distinct from the PLAN's maximum allowed cadence
  -- (lib/entitlements/plans.ts's own `monitoringCadence`) — that field is
  -- "what this plan permits," this one is "what this website owner has
  -- actually chosen," and the two are reconciled at write time (never
  -- silently clamped after the fact) by the service layer, not by a
  -- database constraint, so a plan downgrade can be handled with a clear
  -- customer-facing message rather than a silent DB-level rejection.
  monitoring_enabled boolean not null default false,

  -- 'none' is the row's own default even when monitoring_enabled is true
  -- only very briefly during setup — the service layer never leaves a row
  -- in that combination once a write completes.
  cadence text not null default 'none',
  constraint website_monitoring_settings_cadence_check check (cadence in ('none', 'weekly', 'daily')),

  -- The most recent completed/partial crawl_run monitoring has already
  -- considered — set null delete so a monitoring settings row is never
  -- itself deleted just because the scan it last pointed at eventually
  -- ages out of any future retention policy.
  last_monitored_crawl_run_id uuid references public.crawl_runs(id) on delete set null,

  -- Foundational only — no scheduler in this codebase ever reads or writes
  -- this column yet. Exists now so the next prompt's scheduler has a
  -- stable column to compute into, rather than requiring a schema change
  -- alongside the scheduler itself.
  next_due_at timestamptz,

  -- A preference placeholder — no notification of any kind is ever sent
  -- by anything in this codebase today. 'none' is the only value that
  -- describes real current behavior; 'email' is reserved for a future
  -- prompt to interpret once real delivery infrastructure exists.
  notification_preference text not null default 'none',
  constraint website_monitoring_settings_notification_preference_check check (notification_preference in ('none', 'email')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index website_monitoring_settings_next_due_at
  on public.website_monitoring_settings (next_due_at)
  where monitoring_enabled = true;

alter table public.website_monitoring_settings enable row level security;

revoke all on public.website_monitoring_settings from public, anon, authenticated;

-- Unlike crawl_runs/crawl_analyses/every finding table (read-only for the
-- owner; written only via the service-role admin client after an
-- application-level ownership check), this table IS a direct user
-- preference the owner manages themselves — mirroring how `websites`
-- itself already grants its owner insert/update, not only select. All
-- three policies independently re-verify the SAME ownership condition
-- (website belongs to the current auth.uid()), which is also re-verified
-- at the application layer by every server action that touches this table
-- (see app/dashboard/websites/[id]/monitoring-settings.ts) — RLS here is a
-- second, defense-in-depth layer, never the only boundary.
grant select, insert, update on public.website_monitoring_settings to authenticated;

create policy "website_monitoring_settings_select_own" on public.website_monitoring_settings
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = website_monitoring_settings.website_id and websites.user_id = auth.uid()));

create policy "website_monitoring_settings_insert_own" on public.website_monitoring_settings
  for insert
  to authenticated
  with check (exists (select 1 from public.websites where websites.id = website_monitoring_settings.website_id and websites.user_id = auth.uid()));

create policy "website_monitoring_settings_update_own" on public.website_monitoring_settings
  for update
  to authenticated
  using (exists (select 1 from public.websites where websites.id = website_monitoring_settings.website_id and websites.user_id = auth.uid()))
  with check (exists (select 1 from public.websites where websites.id = website_monitoring_settings.website_id and websites.user_id = auth.uid()));

comment on table public.website_monitoring_settings is
  'Sprint 2, Prompt 1 — per-website monitoring preferences only (enabled/disabled, cadence, last-considered scan, next-due placeholder, notification preference). No scheduler/queue/email infrastructure reads or writes this yet; it is the stable domain foundation a future prompt''s scheduler will build on, not a working scheduler itself.';
