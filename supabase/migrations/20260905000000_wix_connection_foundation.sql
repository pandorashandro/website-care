-- Wix V1 Prompt 1 — connection foundation.
--
-- NOT YET APPLIED to any live Supabase project. Prepared per this phase's
-- explicit instruction: "Prepare a migration file but DO NOT apply it to
-- live Supabase." Additive only — creates two new tables, touches nothing
-- that already exists. Mirrors the existing shopify_connections /
-- shopify_oauth_states pattern (same ownership boundary: zero
-- anon/authenticated grants, every access funneled through the
-- service-role admin client after an independent, application-level
-- ownership check against `websites` via the ordinary session-aware
-- client — see app/dashboard/websites/[id]/shopify-credentials.ts's own
-- doc comment for the full reasoning this mirrors).
--
-- Deliberately SIMPLER than shopify_connections: Wix's current
-- authentication model (OAuth Client Credentials — see
-- docs/wix-api-research.md §1) has no refresh token and no expiring
-- access token to persist at all. The only durable per-connection
-- credential is `instanceId`, which Wix's own docs describe as "a
-- permanent credential for this app-site connection" — encrypted here at
-- rest as defense-in-depth (the same posture WordPress/Shopify credentials
-- already get), even though, unlike a bearer token, it is only usable in
-- combination with webioom's own static app secret (never stored per
-- connection — see lib/integrations/wix/config.ts's WIX_APP_SECRET).

create table if not exists public.wix_connections (
  website_id uuid primary key references public.websites(id) on delete cascade,
  -- Wix site GUID (the install callback's `tenantId`) — NOT a secret, but
  -- stored alongside the connection for display/diagnostic purposes only.
  -- Never used as an authorization boundary by itself.
  site_id text not null,
  -- Encrypted via lib/security/encryption.ts's encryptCredential, exactly
  -- like WordPress's application password and Shopify's access/refresh
  -- tokens. See module doc comment above for why this is a permanent,
  -- non-rotating value in Wix's current model.
  encrypted_instance_id text not null,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.wix_connections is
  'One Wix app-instance connection per webioom website. instanceId is the sole durable per-connection credential in Wix''s Client Credentials auth model (no refresh token exists) — encrypted at rest. Zero anon/authenticated grants; access only via the service-role admin client after an independent application-level ownership check, mirroring shopify_connections.';

create table if not exists public.wix_oauth_states (
  -- Single-use, cryptographically random opaque state token — see
  -- lib/integrations/wix/install.ts's module doc comment for why webioom
  -- generates its own opaque state rather than passing raw business data
  -- in the postInstallationUrl the way Wix's own sample code does.
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.wix_oauth_states is
  'Single-use install-flow state, binding a webioom user + website to one External Install Flow attempt before Wix redirects back — the Wix analogue of shopify_oauth_states. Consumed atomically (DELETE...RETURNING) by the callback route; never a plain SELECT-then-DELETE.';

-- Ownership boundary: the anon/publishable key is effectively public
-- (embedded in the client bundle) and can reach Supabase's REST API
-- directly regardless of application code, so RLS alone is not treated as
-- sufficient for either table — see the Shopify precedent this mirrors.
-- Every access must go through app/dashboard/websites/[id]/wix-credentials.ts
-- (service-role admin client), which independently re-verifies
-- `websites.user_id = auth.uid()` via the ordinary session-aware client
-- BEFORE ever touching either table below.
revoke all on public.wix_connections from public, anon, authenticated;
revoke all on public.wix_oauth_states from public, anon, authenticated;

-- Rollback strategy: both tables are new and additive. Reverting this
-- migration is a plain `drop table if exists public.wix_oauth_states;
-- drop table if exists public.wix_connections;` — safe at any point before
-- Wix connection rows exist, since nothing else references these tables
-- (no foreign key from any existing table points here) and no existing
-- table's schema or data is touched by this migration at all.
