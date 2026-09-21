-- Sprint 3 (monitoring + notifications completion).
--
-- Two small, additive schema changes — no existing migration is edited,
-- no existing column/constraint is dropped, no data is migrated or backfilled
-- destructively:
--
-- 1. website_monitoring_settings.cadence gains 'biweekly' as a valid value,
--    for the LOCKED plan-cadence model (Bloom = biweekly, Bloom Pro =
--    weekly, Agency = weekly by default / daily configurable — see
--    lib/entitlements/plans.ts's own updated doc comment). Postgres has no
--    "ALTER CHECK" — the existing constraint is dropped and an equivalent,
--    widened one is added in its place; no row's stored value is touched,
--    and every previously-valid value ('none'/'weekly'/'daily') remains
--    valid.
--
-- 2. monitoring_events gains `read_at` — the entire schema this sprint's
--    in-app Notification Center needs. A monitoring_events row already is
--    the correct, deduplicated, grouped "one notification per meaningful
--    change or failure" record (see that table's own Prompt 2 doc comment)
--    for the one user who owns the website it concerns — there is
--    deliberately no separate `notifications` table duplicating that same
--    data, which would only create a second place for "what happened" and
--    "was it read" to drift apart. `read_at` is nullable (null = unread,
--    matching this codebase's established "null means the honest absence
--    of a fact" convention rather than a fabricated boolean default) and
--    is written ONLY by the service-role admin client after that client
--    has independently verified the requesting user owns the website in
--    question (see app/dashboard/notifications/actions.ts) — no new RLS
--    policy is needed for the write, exactly like every other
--    monitoring_events write already works (see the previous migration's
--    own "every write happens via the service-role admin client" comment).
--    The existing `monitoring_events_select_own` policy already covers
--    reading this new column with zero changes.

alter table public.website_monitoring_settings
  drop constraint website_monitoring_settings_cadence_check;

alter table public.website_monitoring_settings
  add constraint website_monitoring_settings_cadence_check
    check (cadence in ('none', 'biweekly', 'weekly', 'daily'));

alter table public.monitoring_events
  add column read_at timestamptz;

comment on column public.monitoring_events.read_at is
  'Null = unread. Set once, to the time the owning user marked this notification read, via a service-role write that has already independently verified website ownership — never written by the browser directly.';

-- Powers both "how many unread" (bell badge) and "recent, unread-first"
-- (notification panel) without a full table scan — partial on read_at is
-- null so the index stays small as read notifications accumulate over time.
create index monitoring_events_website_unread
  on public.monitoring_events (website_id, created_at desc)
  where read_at is null;
