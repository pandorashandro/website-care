-- Phase 20.1F — Shopify fix history & safe Undo

alter table public.fix_history
  alter column resource_id drop not null;

alter table public.fix_history
  add column if not exists resource_gid text;

comment on column public.fix_history.resource_gid is
  'Canonical Shopify Admin GraphQL GID for this row''s resource (Product/Collection/Page/Article). Always null for WordPress rows, which use resource_id instead.';

do $$
declare
  found_constraint text;
begin
  select conname into found_constraint
  from pg_constraint
  where conrelid = 'public.fix_history'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%platform%';

  if found_constraint is not null then
    execute format('alter table public.fix_history drop constraint %I', found_constraint);
    alter table public.fix_history
      add constraint fix_history_platform_check
      check (platform in ('wordpress', 'shopify'));
  end if;
end $$;

do $$
declare
  found_constraint text;
begin
  select conname into found_constraint
  from pg_constraint
  where conrelid = 'public.fix_history'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%resource_type%';

  if found_constraint is not null then
    execute format('alter table public.fix_history drop constraint %I', found_constraint);
    alter table public.fix_history
      add constraint fix_history_resource_type_check
      check (resource_type in ('page', 'post', 'product', 'collection', 'article'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fix_history'::regclass
      and conname = 'fix_history_resource_identity_check'
  ) then
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
        )
      );
  end if;
end $$;