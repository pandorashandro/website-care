# Monitoring DB integration tests

`monitoring-db-integration.test.ts` exercises the real Sprint 2 monitoring
service modules (`lib/monitoring/due-service.ts`, `event-service.ts`,
`delivery-service.ts`, `monitoring-run.ts`) against a real local Postgres
instance, never a mock. It is skipped by default — the plain `npm test` /
`vitest run` never touches a database.

## Why a scratch project, not `supabase/` in this repo

`websites` (and other legacy tables like `fix_history`, `shopify_connections`)
predate migration tracking in this repository and have no tracked migration
of their own. Running `supabase start` directly against `supabase/migrations/`
in this repo therefore fails on the very first legacy migration that assumes
`websites` already exists. This suite instead runs against a **separate,
disposable** local Supabase project containing only the migrations the
monitoring pipeline actually depends on, plus one test-only bootstrap
migration standing in for `websites`. Nothing here is ever applied to this
repository's own `supabase/` directory or to the real project.

## Reproducing the verified local environment

```sh
mkdir -p /tmp/monitoring-integration-db/supabase/migrations
cd /tmp/monitoring-integration-db
npx supabase init --workdir .

# Copy in order (real repo path -> scratch project):
# 20260910000000_subscriptions_foundation.sql
# 20260915000000_paddle_subscription_sync.sql
# 20260920000000_crawl_foundation.sql
# 20260927000000_technical_seo_findings.sql
# 20260930000000_technical_seo_remediation.sql
# 20261007000000_site_architecture_findings.sql
# 20261014000000_on_page_findings.sql
# 20261021000000_content_findings.sql
# 20261028000000_content_v2_dimensions.sql
# 20261104000000_content_analysis_coverage.sql
# 20261111000000_pillar_findings.sql
# 20261125000000_monitoring_foundation.sql
# 20261126000000_monitoring_scheduling.sql
# 20261127000000_monitoring_delivery_provider_message_id.sql
#
# Deliberately EXCLUDED (Shopify/Wix-specific, no monitoring dependency,
# and themselves depend on other untracked legacy tables):
# 20260901000000_shopify_fix_history.sql
# 20260905000000_wix_connection_foundation.sql
# 20260905010000_wix_fix_history.sql

# Plus one test-only bootstrap migration dated BEFORE all of the above
# (e.g. 20260101000000_test_bootstrap_websites.sql) creating a minimal
# `public.websites` table — see this file's own header comment in git
# history / the session that produced it for the exact SQL (id, user_id
# references auth.users, name, url, created_at, RLS: owner select/insert/
# update/delete).

npx supabase start
```

`supabase start` prints the local `API_URL` (`http://127.0.0.1:54321`) and
`SERVICE_ROLE_KEY` — Supabase's own well-known local-dev demo credentials,
identical on every machine, never a secret, and only ever valid against
`127.0.0.1`. These are hardcoded in `monitoring-db-integration.test.ts`
itself for exactly that reason.

## Running

```sh
RUN_MONITORING_DB_INTEGRATION=1 npx vitest run tests/integration/monitoring-db-integration.test.ts
```

## Tearing down

```sh
cd /tmp/monitoring-integration-db && npx supabase stop
```

This never touches this repository's own real Supabase project — it is a
fully separate, disposable local project.
