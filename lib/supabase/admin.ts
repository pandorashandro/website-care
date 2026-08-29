import 'server-only'
import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client authenticated with SUPABASE_SERVICE_ROLE_KEY —
 * bypasses Row Level Security entirely. The `server-only` import above
 * throws at build/runtime if this module is ever pulled into a client
 * bundle, so it cannot be imported from a Client Component.
 *
 * This exists ONLY for narrowly-scoped trusted server flows that have no
 * user Supabase session to rely on at all (the Shopify OAuth callback, the
 * Shopify app/uninstalled webhook — both server-to-server requests Shopify
 * itself makes, with no cookies), or that need to read/write a table whose
 * grants deliberately exclude the anon/authenticated roles (see
 * shopify-credentials.ts, which independently proves website ownership via
 * the ordinary session-aware client from lib/supabase/server.ts BEFORE
 * ever calling this one).
 *
 * This must NEVER silently replace lib/supabase/server.ts's ordinary,
 * session-aware, RLS-respecting client anywhere in the app. Every call
 * site using this module is expected to document, in its own code, exactly
 * how authorization was established before reaching here — this client
 * performs no ownership check of its own, by design, since it has no
 * concept of "the current user" at all.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin client is not configured.')
  }

  return createSupabaseJsClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
