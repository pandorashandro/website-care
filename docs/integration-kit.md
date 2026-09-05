# Adding a new webioom platform integration

This is the practical guide for implementing platform #3 (Wix, Webflow,
Squarespace, or anything else). It exists because WordPress and Shopify
already proved out a real pattern — this document names that pattern so
the next integration doesn't have to rediscover it from scratch.

It is deliberately **not** a framework. There is no base class or
interface to implement. Read this, then look at the two real examples:

- WordPress: `lib/integrations/wordpress/adapter.ts` + the
  `app/dashboard/websites/[id]/wordpress-*.ts` orchestration files.
- Shopify: `lib/integrations/shopify/` + the
  `app/dashboard/websites/[id]/shopify-*.ts` orchestration files.

The shared, genuinely-reusable pieces both of them already depend on live
in `lib/integrations/kit.ts` (a re-export index, not new logic) and
`lib/fixes/fixability.ts` / `lib/fixes/verification-status.ts`.

## 1. Register the platform

Add your platform to `PlatformType` in `lib/integrations/platform.ts`, then
add its entry to `INTEGRATION_REGISTRY` in `lib/integrations/registry.ts`,
then add a card renderer to `INTEGRATION_CARD_RENDERERS` in
`components/integrations/integration-list.tsx`.

**Do this last, not first.** Every one of these is a `Record<PlatformType,
...>` specifically so that widening `PlatformType` immediately fails to
compile everywhere a decision about the new platform hasn't been made yet
(registry entry, card renderer, rollback-compatibility — see step 9). Add
`PlatformType` only once your connection, resource-mapping, and at least
one real fix family already work — Shopify's own history shows why: its
backend (OAuth, resource mapping, capabilities, Title, Meta) was built and
committed across several phases *before* `PlatformType` ever grew a
`'shopify'` member, precisely so the compiler couldn't be used as a
substitute for "is this actually ready to show a merchant."

## 2. Authentication / connection responsibilities

Own this entirely yourself — WordPress uses REST Application Passwords
verified directly against the site; Shopify uses OAuth with a signed
callback and rotating refresh tokens. There is no shared "Connection"
interface, because there shouldn't be one: the two are not shaped alike.

What every integration's connection layer must still do, independently:

- Store credentials encrypted at rest (`lib/security/encryption.ts`).
- Re-verify webioom session + website ownership on **every** call that
  touches the connection — never once at the top of a request and then
  trusted for the rest of it (see `shopify-credentials.ts`'s
  `verifyWebsiteOwnership`, called fresh by every exported function).
- If the credential-bearing table can be reached by Postgres's
  `anon`/`authenticated` roles at all, treat RLS as insufficient on its
  own and remove those grants entirely, funneling every access through a
  service-role admin client (`lib/supabase/admin.ts`) — this is what
  `shopify_connections`/`shopify_oauth_states` do; the ownership check
  above is the *only* boundary those tables have.
- Provide a `getXConnectionStatus`/`toXIssueFixabilityInputs`-style pair
  (see `shopify-connection-status.ts`) that reduces your platform's own
  connection diagnostics down to the shared
  `IntegrationConnectionState` (`'not_connected' | 'connected' |
  'needs_attention'`) — this is the one thing fixability actually
  consumes, and it's cheap to produce even though your platform's real
  diagnostic state is richer.

## 3. Resource identity / mapping responsibilities

Own your own identity scheme. WordPress uses a numeric post/page ID;
Shopify uses a GraphQL GID string. Do not force either shape onto the
other, and do not invent a shared `ResourceIdentity` type — `fix_history`
already models "each platform has its own identity, unified only at the
storage layer" with two nullable columns (`resource_id` for WordPress,
`resource_gid` for Shopify/GID-based platforms) plus a **database-level**
CHECK constraint (`fix_history_resource_identity_check` in
`supabase/migrations/20260901000000_shopify_fix_history.sql`) enforcing
that exactly one is set per platform. If your platform's identity is
GID/string-shaped, reuse `resource_gid`; if it's numeric, reuse
`resource_id`. Only add a new column if neither shape fits at all, and if
so, treat that as a real schema decision requiring the same review any
other migration would.

Resolution itself (public URL → confirmed platform resource) is entirely
your own adapter's job — see `resolveShopifyResource` for the shape to
match: given a URL, return either a fully-resolved, fully-typed resource
identity or a specific, named failure reason (never a bare `null`/`false`
that loses *why*). Fail closed on ambiguity — an "ambiguous_resource"
result must never guess.

## 4. Capability / scope responsibilities

Two layers exist, and you need both, but they serve different callers:

1. **Report-level fixability** — a coarse, cheap-to-compute answer
   ("should this issue show an assisted-fix badge and a Prepare button at
   all") that must NOT make a resource-specific network call per issue on
   a report page. See `lib/integrations/shopify/issue-fixability.ts`:
   it returns the shared `FixabilityResult` type (from
   `lib/fixes/fixability.ts`, do not redeclare this), but is its own,
   separate evaluator — it does not call `evaluateFixability` and does
   not need to, because Shopify's real capability model (scope-per-
   resource-type) cannot be represented by the generic two-key
   `IntegrationCapabilitySnapshot` WordPress uses. **Do not force your
   platform's capability model into that snapshot shape if it genuinely
   doesn't fit — write your own evaluator that returns `FixabilityResult`,
   exactly like Shopify's does.**
2. **Prepare/Apply-time capability** — the real, per-resource,
   per-fix-family answer, evaluated fresh, every time, from a **live**
   scope/permission fetch (never the stored/cached value — see
   `scopes.ts`'s `getGrantedShopifyScopes` doc comment for why: a merchant
   can revoke a permission at any time, independent of your own
   token-refresh cadence). See `evaluateShopifyFixCapability` in
   `lib/integrations/shopify/capabilities.ts` for the shape: one pure
   function, given (fixFamily, resolved resource context, fresh scope
   result), returning a specific, exhaustive result type — `supported` /
   `missing_scope` / `unsupported_resource` / connection-health failure
   variants. Never a bare boolean.

Both layers must fail closed on anything not explicitly proven — an
unmapped (fixFamily, resourceType) pair is `unsupported_resource`, not
`supported`; a scope-fetch failure is a named failure variant, not
`supported`.

## 5. Prepare responsibilities

Read-only. Starts from a trusted, server-derived identity (an opaque
`issueId`, walked through the `issues → scans → websites → user` ownership
chain fresh — see `getTrustedShopifyTitleIssue`) — never a browser-supplied
page URL or field value used as the resource's identity. Resolve the
resource fresh, evaluate capability fresh, read the current live value
fresh, generate a proposal (AI or deterministic), validate it, then sign a
preview token (`lib/fixes/preview-token.ts`) binding: website, issue,
field, resource type + identity, the current value the proposal was
generated against, and the proposed value. Give it its own token kind
(`sign<Platform><Field>PreviewToken`) — do not reuse another platform's or
field's token shape; the payload fields are legitimately different per
field/platform and forcing them into one generic shape has already been
explicitly rejected twice (Title vs. Meta Description even within
Shopify).

## 6. Apply responsibilities

Every single one of the following, every time, no exceptions:

1. Re-authenticate the session; re-walk the ownership chain from scratch
   (never trust the token's own websiteId/issueId as proof the *current*
   caller may act on them).
2. Obtain a **fresh** credential/token (never reused from Prepare).
3. Fetch **fresh** scopes/capabilities.
4. Re-resolve the resource **fresh** from the trusted page URL.
5. Confirm the freshly-resolved resource is the **exact same** resource
   the token was signed for (identity match, not just "a" match).
6. Re-evaluate capability fresh (a scope revoked since Prepare must be
   caught here).
7. Drift check: the live current value must still exactly equal what the
   token recorded as "expected" — any deviation aborts, except the
   specific idempotent case where the live value already equals the
   *proposed* value (report `already_applied`, do not write again).
8. Use the **one** dedicated writer for this exact field on this exact
   resource type. There is no `write(field, value)` anywhere in this
   codebase, on either platform, and there must never be one — this is a
   security invariant (see §11), not a style preference.
9. Validate the mutation's own response against what was expected before
   ever reporting success.
10. Report write success (`writeStatus`/whatever your fix family calls
    it) completely independently of verification (§7) and of history
    persistence (§8) — a history-write failure or an inconclusive
    verification must never be reported as, or imply, that the underlying
    platform write failed.

If your platform's mutation API offers a real optimistic-concurrency
primitive (Shopify's metafield `compareDigest` is the current example),
use it as a second layer on top of the fresh-read drift check, not a
replacement for it. If it doesn't, the fresh-read-then-write pattern above
(steps 4–7, all within the same request, minimizing the race window) is
the accepted baseline — this is what Title and Product/Collection Meta
already do.

## 7. Verification responsibilities

A successful write and a *verified* public result are two separate facts,
always. Verification is a single, read-only, single-attempt (no retries,
no polling) fetch of the **public** page — never the authenticated
admin/management API — using whatever hardened fetch primitive your
scanner already uses (SSRF guarding, redirect re-validation per hop,
bounded timeout, HTTPS-only; see `lib/scanner/checks.ts`'s `fetchPage`,
reused as-is by every current verifier on both platforms).

Your result must be built from the shared
`lib/fixes/verification-status.ts` vocabulary:
`'verified' | 'pending' | 'mismatch' | 'unavailable'`. You may add exactly
one platform/field-specific extension if you have a genuinely distinct
concept (WordPress Title/Meta's `'still_detected'` — "the write succeeded
but the *original scanner issue* still isn't resolved" — is the only
current example; most fix families don't need one). Do not invent new
core status names — the shared badge/history UI
(`components/activity/activity-helpers.ts`'s `VERIFICATION_COPY`) already
interprets exactly this vocabulary for every platform, and a new,
unrecognized status string will silently fall back to a generic "Unknown"
badge rather than fail loudly, so staying within the shared vocabulary is
what makes your fixes show up correctly there with zero extra UI work.

If your platform can serve a non-representative response for a public URL
(an access gate, a maintenance page, a bot-block page) with **strong,
platform-controlled evidence** (not a heuristic over ordinary page copy),
detect it and report `unavailable` rather than comparing against it — see
`isShopifyPasswordOrAccessPage` for the pattern (a reserved URL path plus a
platform-emitted, non-theme-customizable form field, either sufficient on
its own).

## 8. History requirements

Every completed write (and rollback) is recorded via
`app/dashboard/websites/[id]/fix-history.ts`'s `recordFixHistory` — no
platform gets its own history table. Pass your own typed platform-identity
constant (see `SHOPIFY_PLATFORM`/`WORDPRESS_PLATFORM` — declare exactly one
such constant, typed as `PlatformType`, per platform), your resource
identity in whichever of `resourceId`/`resourceGid` fits (§3), and the
**real, freshly-observed** verification status — never a placeholder that
implies the admin response alone proved public rendering. History is
recorded only *after* the underlying write already succeeded; a failure to
record history must be reported truthfully (a `historyStatus: 'failed'`-
shaped field on your Apply result) and must never be conflated with the
underlying write having failed — the external change already happened
regardless of whether webioom managed to log it.

## 9. Undo requirements

Add a genuinely **separate** rollback-eligibility predicate in
`fix-history.ts` — do not fold it into another platform's. WordPress's
`isRollbackEligibleByShape` and Shopify's `isShopifyRollbackEligibleByShape`
are deliberately two different functions because their `resource_type`
vocabularies can collide on the same literal string (both platforms happen
to use `'page'` to mean unrelated things) — every caller (see
`components/activity/activity-item.tsx`) branches on `platform` **first**,
before either eligibility function is even reachable, and your platform
must follow the same pattern. Also add your platform to
`ROLLBACK_COMPATIBLE_PLATFORMS` in `fix-history.ts` with an explicit
`true`/`false` — this is a `Record<PlatformType, boolean>` specifically so
a new platform can never silently default to "rollback-compatible" (or
"incompatible") by omission.

The rollback action itself takes **only** an opaque `fixHistoryId` (plus
`websiteId`) from the browser. Every other fact — restore value, resource
identity, current live state — is re-derived server-side from the trusted
history row and a fresh re-resolution, exactly mirroring Apply's own
rechecking sequence (§6). Drift protection applies here too: if the live
value no longer exactly equals what webioom itself last applied, abort
with a user-safe message explaining that Undo was stopped to protect a
newer change — never silently overwrite it. The original history row is
never mutated or deleted; a rollback inserts a **new** row (previous/
applied values swapped relative to the original fix) so the audit trail
stays append-only.

## 10. Frontend integration points

- A connection card (`components/integrations/<platform>-integration-card.tsx`)
  showing not_connected / connected / needs_attention, wired to your own
  connect/disconnect/reconnect Server Actions. Never render a token,
  secret, or raw credential — a non-secret identifier (a shop domain, a
  site URL) is fine.
- Wire your fixability result into `components/report/issue-group.tsx` by
  extending the existing `fixProvider` decoration pattern in
  `app/dashboard/websites/[id]/page.tsx` (see the `getFixability` combiner
  there): compute your platform's own result, and only let it win when the
  existing (WordPress-first) result isn't already `assisted` — this is
  what keeps existing platforms' behavior byte-identical when your new
  platform isn't connected.
- A Prepare/Apply UI component per fix family (or one component branching
  on field, like `shopify-prepare-fix-button.tsx`) that shows write result
  and verification result as two visually separate facts (§7) — never
  collapse them into one "success" message.
- Undo buttons routed through the platform-first branch in
  `components/activity/activity-item.tsx` (§9).

## 11. Security invariants (every integration, no exceptions)

- **Never trust browser-supplied resource identity, current value, scopes,
  or rollback restore values when server derivation is possible.** The
  browser may submit only opaque references (an `issueId`, a
  `fixHistoryId`, a signed preview token) — everything with actual
  authority is re-derived server-side, fresh, on every request.
- **Fail closed when the exact target or capability cannot be proven.**
  Ambiguity, an unmapped combination, a scope-fetch failure, or an
  unrecognized resource type must never resolve to "supported" or
  "eligible" by default.
- **Write success and public verification are separate facts, always.**
- **Undo is server-authoritative and drift-protected** — it must use
  trusted server-side history, and it must refuse to proceed if the live
  state no longer matches what webioom itself last wrote.
- **One dedicated writer per field, per platform.** No generic
  `write(field, value)`/`updateResource(...)`, ever.
- **Credentials are encrypted at rest and never returned to the browser.**
  If a credential-bearing table is reachable by Postgres's
  `anon`/`authenticated` roles at all, remove those grants and route every
  access through a service-role client, gated by an independent
  application-level ownership check.

## 12. Required regression tests

Add to `tests/` (see `vitest.config.ts` — plain Node environment, no
`jsdom`, no live network/credentials). At minimum, cover:

- Your platform is correctly registered (and no unimplemented platform is
  accidentally registered) — extend `tests/platform-registry.test.ts`'s
  pattern.
- Your rollback-eligibility predicate fails closed for: the other
  platform's rows, unsupported fields, missing/null resource identity, a
  null previous value — extend `tests/rollback-eligibility.test.ts`'s
  pattern, and add an explicit test proving a same-named `resource_type`
  collision with another platform can't cross eligibility functions.
- Your capability evaluator fails closed for missing scopes, unsupported
  resource/field combinations, and connection-health failures — see
  `tests/shopify-capability.test.ts`.
- Any HMAC/signature/URL-normalization helper your auth flow depends on —
  test the pure function directly with synthetic (never real) secrets, as
  `tests/shopify-oauth-security.test.ts` does.
- Any pure, security-relevant detector (an access-gate detector, etc.) —
  export it and test it directly rather than mocking the network call
  around it, as `tests/shopify-verification.test.ts` does.

Do not write a test that mocks every dependency of a function just to
assert it returns what you told the mocks to return — that proves
nothing. Test real, pure logic with real inputs.
