-- Wix V1 Prompt 2 — fix_history identity support for Wix rows.
--
-- Applied to the live Supabase project.
-- The live schema only had one relevant CHECK constraint:
-- fix_history_resource_identity_check.
-- No platform/resource_type CHECK constraints existed, so this migration
-- updates only the real live constraint rather than inventing new ones.

begin;

alter table public.fix_history
  drop constraint fix_history_resource_identity_check;

alter table public.fix_history
  add constraint fix_history_resource_identity_check
  check (
    platform is not null
    and (
      (
        platform = 'wordpress'
        and resource_id is not null
        and resource_gid is null
      )
      or
      (
        platform = 'shopify'
        and resource_gid is not null
        and resource_id is null
      )
      or
      (
        platform = 'wix'
        and resource_gid is not null
        and resource_id is null
      )
    )
  );

commit;