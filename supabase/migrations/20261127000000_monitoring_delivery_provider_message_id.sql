-- Sprint 2, Prompt 3 — PRODUCTION ACTIVATION.
--
-- NOT YET APPLIED to any live Supabase project — see this repository's
-- established "NOT YET APPLIED" convention on every prior migration.
-- Additive only: one nullable column on the already-defined (also not yet
-- applied) monitoring_deliveries table from
-- 20261126000000_monitoring_scheduling.sql. Must be applied AFTER that
-- migration (and after 20261125000000_monitoring_foundation.sql, which it
-- itself depends on) — table creation order matters here, column addition
-- does not depend on any other new object.
--
-- Records the provider's own message id for a successfully sent delivery,
-- now that lib/monitoring/email/resend-provider.ts exists and can return
-- one (see EmailSendResult.providerMessageId) — useful for correlating a
-- `monitoring_deliveries` row with the provider's own dashboard/logs
-- during support/debugging, never used for any decision this codebase
-- itself makes (delivery status/retry logic is entirely driven by the
-- existing status/attempt_count/claim columns, not by this value's
-- presence or absence).

alter table public.monitoring_deliveries
  add column provider_message_id text;

comment on column public.monitoring_deliveries.provider_message_id is
  'The email provider''s own id for a successfully sent message (Resend today — see lib/monitoring/email/resend-provider.ts). Null until sent, and null forever for a delivery that never succeeds. Informational only, for support/debugging correlation with the provider''s own dashboard — no code path in this application reads it back to make a decision.';
