-- Sprint 2, Prompt 2 — SCHEDULED MONITORING + MEANINGFUL CHANGE EVENTS +
-- NOTIFICATION ARCHITECTURE.
--
-- NOT YET APPLIED to any live Supabase project — prepared per this
-- repository's established convention (see every prior migration's own
-- "NOT YET APPLIED" note). Review against the live schema before applying.
--
-- Additive only. Alters website_monitoring_settings (Prompt 1) to add the
-- scheduler-claiming/last-run-outcome columns actually needed to make it
-- operational; creates two new tables (monitoring_events, monitoring_
-- deliveries). Touches no crawl/finding/entitlement table — Overall
-- Website Health, the 7 pillar scores, and every finding table remain
-- exactly as Prompt 1 left them, the sole source of truth this sprint
-- reads from.
--
-- DOMAIN EVENT vs DELIVERY, kept as two tables on purpose (see this
-- sprint's own Step 8): monitoring_events is "what meaningful change
-- occurred" — durable, generated once per (website, newly-completed scan)
-- pair, and never deleted or rewritten by a failed email. monitoring_
-- deliveries is "did we tell the customer, and how" — one row per attempt
-- to deliver one event over one channel, with its own independent status/
-- retry state. A failed send can be retried indefinitely without ever
-- touching, duplicating, or losing the underlying event record.

-- ---------------------------------------------------------------------------
-- website_monitoring_settings — add scheduler-claiming + last-run-outcome
-- columns. The customer-facing preference columns Prompt 1 already added
-- (monitoring_enabled, cadence, next_due_at, last_monitored_crawl_run_id,
-- notification_preference) are untouched.
-- ---------------------------------------------------------------------------

alter table public.website_monitoring_settings
  -- The scheduler-claiming state machine (see lib/monitoring/claim.ts).
  -- 'idle' = no monitoring cycle currently in flight for this website;
  -- 'running' = a scheduler invocation currently owns this website's
  -- monitoring cycle (claimed via claim_token below). A row stuck at
  -- 'running' past MONITORING_STALE_CLAIM_MINUTES (see lib/monitoring/
  -- claim.ts) is treated as an abandoned claim from a crashed/timed-out
  -- invocation and becomes reclaimable — exactly mirroring crawl_pages'
  -- own STALE_CLAIM_MINUTES reclaim pattern (see the Phase 25A migration),
  -- deliberately reused rather than inventing a second reclaim convention.
  add column run_status text not null default 'idle',
  add constraint website_monitoring_settings_run_status_check
    check (run_status in ('idle', 'running')),

  -- Set only while run_status = 'running'. claim_token is what lets the
  -- invocation that currently holds the claim safely write back its own
  -- result even if a LATER invocation has since reclaimed this row as
  -- stale (that later invocation's own, different claim_token means the
  -- first invocation's late write-back, guarded by `where claim_token =
  -- $1`, simply affects zero rows instead of corrupting the new claim).
  add column claimed_at timestamptz,
  add column claim_token uuid,

  -- The outcome of the MOST RECENT monitoring attempt, independent of
  -- whether it succeeded — deliberately separate from
  -- last_monitored_crawl_run_id, which only ever advances on a genuine
  -- successful completion. This is what lets the Overview status surface
  -- honestly say "Last monitoring scan failed" without pretending the
  -- failed attempt was a successful check, and without losing track of
  -- when the last successful one actually was.
  add column last_run_status text,
  add constraint website_monitoring_settings_last_run_status_check
    check (last_run_status in ('success', 'failed')),
  add column last_run_at timestamptz,
  -- Sanitized, human-readable summary only — never a raw exception
  -- message/stack trace, and never any credential or secret (see
  -- lib/monitoring/errors.ts's sanitizeMonitoringError, which every write
  -- to this column goes through).
  add column last_run_error text;

comment on column public.website_monitoring_settings.run_status is
  'Scheduler-claiming state: idle (claimable) or running (currently owned by one scheduler invocation, via claim_token). A stale running claim past the reclaim window is treated as abandoned and becomes claimable again.';
comment on column public.website_monitoring_settings.last_run_status is
  'Outcome of the most recent monitoring attempt (success/failed), independent of last_monitored_crawl_run_id, which only advances on genuine success. Lets the UI show "last scan failed" honestly without ever appearing to be a false successful check.';

-- Supersedes Prompt 1's own next_due_at partial index for the scheduler's
-- actual due-query, which also filters on run_status — kept alongside
-- Prompt 1's index rather than replacing it (both are cheap, partial
-- indexes; no query depends on only one existing).
create index website_monitoring_settings_due_claimable
  on public.website_monitoring_settings (next_due_at)
  where monitoring_enabled = true and run_status = 'idle';

-- ---------------------------------------------------------------------------
-- monitoring_events — "what meaningful website change occurred?"
-- ---------------------------------------------------------------------------
--
-- One row per (website, newly-completed comparable scan) pair that Sprint
-- 2 Prompt 1's own deterministic comparison (lib/monitoring/compare.ts)
-- and this sprint's notification-noise-control rules
-- (lib/monitoring/notification-rules.ts) judged customer-relevant enough
-- to surface — never one row per scan, and never one row per individual
-- persistent/unchanged finding. See this sprint's own Step 6/7 for exactly
-- which conditions qualify.
--
-- IDEMPOTENCY: the unique (website_id, current_crawl_run_id) constraint
-- below is the entire idempotent-event-generation guarantee — if the
-- monitoring pipeline's own event-generation step ever runs twice for the
-- same newly-completed scan (a retried request after a crash between
-- comparing and persisting, for example), the second attempt's insert
-- hits this constraint and is treated as "already recorded," never as a
-- second, duplicate event.
create table public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites(id) on delete cascade,

  event_type text not null,
  constraint monitoring_events_event_type_check
    check (event_type in ('meaningful_change', 'monitoring_scan_failed')),

  -- Nullable only for the rare case a monitoring cycle fails before any
  -- crawl_run row could be created at all (see lib/monitoring/monitoring-
  -- run.ts) — in every other case (including a scan that failed mid-crawl)
  -- this points at the real crawl_run the event is about.
  current_crawl_run_id uuid references public.crawl_runs(id) on delete set null,
  previous_crawl_run_id uuid references public.crawl_runs(id) on delete set null,

  -- Which centralized notification-rule(s) actually fired — e.g.
  -- ["new_high_severity_finding", "overall_health_declined"] — see
  -- lib/monitoring/notification-rules.ts's own MeaningfulChangeReason
  -- union, the single source of truth for every string that can appear
  -- here. Stored as an array (not a single reason) because more than one
  -- rule commonly fires together.
  reasons jsonb not null default '[]'::jsonb,

  overall_health_previous integer,
  overall_health_current integer,
  overall_health_delta integer,

  new_count integer not null default 0,
  resolved_count integer not null default 0,
  worsened_count integer not null default 0,
  improved_count integer not null default 0,
  persistent_count integer not null default 0,
  unverified_count integer not null default 0,

  -- A small, capped (<=5), already-rendered slice of the highest-priority
  -- new/worsened/resolved/improved findings this event concerns — stored
  -- directly so email rendering never needs a second round of
  -- comparison/evidence queries against potentially-large finding tables.
  -- Each entry: {title, severity, state}. Never the full finding list.
  top_findings jsonb not null default '[]'::jsonb,

  -- Only set for event_type = 'monitoring_scan_failed'. Sanitized only —
  -- see website_monitoring_settings.last_run_error's own comment; the same
  -- sanitizer is used for both columns.
  failure_reason text,

  created_at timestamptz not null default now(),

  unique (website_id, current_crawl_run_id)
);

comment on table public.monitoring_events is
  'Sprint 2, Prompt 2 — durable domain events for scheduled monitoring: "what meaningful change occurred," independent of whether/how a customer was ever notified about it. Generated by the trusted service-role monitoring pipeline only; never written to directly by the browser.';

create index monitoring_events_website_created_at
  on public.monitoring_events (website_id, created_at desc);

alter table public.monitoring_events enable row level security;

revoke all on public.monitoring_events from public, anon, authenticated;

-- Read-only for the owner, exactly like crawl_runs/every finding table
-- (Prompt 1's own established pattern for system-generated data, as
-- opposed to website_monitoring_settings' own direct-user-preference
-- exception) — every write happens via the service-role admin client from
-- the trusted monitoring pipeline only, after it has already established
-- which website it is entitled to act on through its own due-work claim
-- (never from arbitrary client input).
grant select on public.monitoring_events to authenticated;

create policy "monitoring_events_select_own" on public.monitoring_events
  for select
  to authenticated
  using (exists (select 1 from public.websites where websites.id = monitoring_events.website_id and websites.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- monitoring_deliveries — "how/when was the customer informed?"
-- ---------------------------------------------------------------------------
--
-- Separate from monitoring_events by design (see this sprint's own Step
-- 8): a failed or retried delivery attempt never mutates, duplicates, or
-- erases the underlying event. One row per (event, channel) — today only
-- ever 'email', but the channel column exists so a future channel is an
-- additive new row type, never a redesign.
create table public.monitoring_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.monitoring_events(id) on delete cascade,

  channel text not null default 'email',
  constraint monitoring_deliveries_channel_check check (channel in ('email')),

  -- pending -> sending (claimed by one worker invocation) -> sent | failed.
  -- A 'failed' row is retried by the SAME claim mechanism that claims
  -- 'pending' rows (see lib/monitoring/delivery.ts) up to
  -- MAX_DELIVERY_ATTEMPTS, so 'failed' is never a dead end by itself —
  -- only exhausting the attempt cap is.
  status text not null default 'pending',
  constraint monitoring_deliveries_status_check
    check (status in ('pending', 'sending', 'sent', 'failed')),

  attempt_count integer not null default 0,
  -- Sanitized only (see monitoring_events.failure_reason's own comment) —
  -- never the provider's raw response body, which could carry request
  -- metadata not meant for storage.
  last_error text,

  -- The exact same claim_token/claimed_at pattern as
  -- website_monitoring_settings' own scheduler claim (see that table's own
  -- comment) — reused here, not reinvented, for the identical reason: let
  -- exactly one concurrent worker invocation own a 'sending' attempt at a
  -- time, and let a stale 'sending' claim (a worker that crashed
  -- mid-send) become safely reclaimable without risking a duplicate send
  -- from the invocation that gave up.
  claim_token uuid,
  claimed_at timestamptz,

  created_at timestamptz not null default now(),
  sent_at timestamptz,

  unique (event_id, channel)
);

comment on table public.monitoring_deliveries is
  'Sprint 2, Prompt 2 — one delivery attempt record per (monitoring_events row, channel). Independent status/retry state from the event itself, so a failed email can never erase or duplicate the underlying domain event.';

create index monitoring_deliveries_claimable
  on public.monitoring_deliveries (status)
  where status in ('pending', 'failed');

alter table public.monitoring_deliveries enable row level security;

revoke all on public.monitoring_deliveries from public, anon, authenticated;

-- Read-only for the owner via a nested ownership check through
-- monitoring_events -> websites — same reasoning as monitoring_events
-- itself; writes are service-role only.
grant select on public.monitoring_deliveries to authenticated;

create policy "monitoring_deliveries_select_own" on public.monitoring_deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.monitoring_events
      join public.websites on websites.id = monitoring_events.website_id
      where monitoring_events.id = monitoring_deliveries.event_id
        and websites.user_id = auth.uid()
    )
  );
