/**
 * Platform-independent integration vocabulary (Phase 19.2, extended 19.4).
 *
 * This module defines TYPES ONLY — no runtime logic, no interfaces, no
 * adapter contracts. It exists so future integration work has a shared
 * vocabulary to build against, without abstracting anything before a real
 * need justifies it. See the Phase 19.1 audit for the full reasoning.
 *
 * Resolved since Phase 19.2:
 *
 * - Resource identity was considered in Phase 19.3 as a dedicated
 *   WordPress-specific type, but no orchestration code ever adopted it in
 *   place of the plain inline resourceType/resourceId/restBase fields
 *   already threaded through every write call — it was confirmed unused and
 *   removed in the Phase 19.5E cleanup. A generic cross-platform resource
 *   shape remains unaddressed and still speculative, since no second
 *   platform's resource vocabulary is known yet.
 * - Connection status is addressed in Phase 19.4 below (IntegrationConnectionState),
 *   now that lib/fixes/fixability.ts is an immediate, real consumer. It is
 *   deliberately a normalized EXECUTION-ELIGIBILITY summary, not a
 *   replacement for WordPress's own diagnostics — see that type's doc
 *   comment for exactly what is and isn't preserved.
 *
 * Still deliberately deferred (documented, not forgotten):
 *
 * - ConnectionAuthenticator / CapabilityProvider / ResourceResolver /
 *   FieldWriter contracts. No second implementation and no immediate need
 *   exists yet to justify an interface. Types only, for now.
 */

/**
 * Every platform webioom can integrate with, AND that is exposed as a real,
 * user-facing dashboard integration (registry entry, connect/disconnect UX,
 * issue-action wiring). 'shopify' was added in Phase 20.1H, once Shopify
 * had both a real, committed adapter surface (connection/auth, Safe Title +
 * Safe Meta Description fixes, fix_history + rollback support, and public
 * verification) AND was deliberately exposed in
 * lib/integrations/registry.ts and
 * components/integrations/integration-list.tsx. 'wix' is added here in Wix
 * V1 Prompt 3, on the same basis: its backend (connection/auth, Blog
 * Post/Stores Product resource mapping, Safe Title + Safe Meta Description
 * fixes, fix_history + rollback support, public verification — Wix V1
 * Prompts 1-2) was already real and compiled, and this phase is the one
 * that deliberately exposes it in the registry/UI. This union only ever
 * grows when both conditions hold, never in advance of them — Webflow,
 * Squarespace, and any other not-yet-implemented platform stay absent
 * until the same bar is met for them.
 */
export type PlatformType = 'wordpress' | 'shopify' | 'wix'

/**
 * The platform vocabulary fix_history is actually allowed to durably
 * record — deliberately WIDER than `PlatformType` whenever a platform's
 * backend is real and compiled but not yet exposed in the dashboard
 * registry. This has now been proven twice (Shopify's 20.1A-20.1E backend,
 * then Wix's Prompt 1/2 backend) and, as of this phase, `PlatformType`
 * itself has caught up to include every platform `FixHistoryPlatform` ever
 * needed to — so the two types are currently equivalent in practice, just
 * as they were after Shopify's own registry exposure. `FixHistoryPlatform`
 * is kept as its own named type (rather than replaced everywhere with
 * `PlatformType`) so app/dashboard/websites/[id]/fix-history.ts and each
 * platform's own `<platform>/platform.ts` constant don't need an unrelated
 * import churn, and so a FUTURE platform can repeat this same
 * backend-before-registry-exposure sequence without fix-history.ts needing
 * another type change at that point.
 */
export type FixHistoryPlatform = PlatformType | 'wix'

/**
 * The generic three-state result of checking whether an integration can do
 * something. Extracted from the WordPress capability model
 * (lib/integrations/wordpress/capabilities.ts's `CapabilityValue`), which
 * already used exactly this vocabulary — this type does not change that
 * file's semantics, only gives the vocabulary a platform-independent home.
 *
 * CRITICAL: 'unknown' must never be treated as 'available'. Every fix
 * family's capability gating fails closed on 'unknown' today (see
 * lib/fixes/fixability.ts's resolveSnapshotCapability) — this type exists
 * to preserve that behavior across future adapters, not to relax it.
 */
export type IntegrationCapabilityState = 'available' | 'unavailable' | 'unknown'

/**
 * The webioom-level capability vocabulary fixability rules actually reason
 * about — deliberately smaller than any one platform's native capability
 * set. Originally extracted (Phase 19.2) from lib/fixes/fixability.ts's
 * then-named `RequiredWordPressCapability`, which the Phase 19.1 audit
 * found was already functioning as this exact layer, just under a
 * WordPress-flavored name; fixability.ts now imports this type directly
 * (Phase 19.4).
 *
 * Contains ONLY the two values a real fix family currently requires. Do
 * not add speculative values (edit_theme, manage_options, publish, delete,
 * commerce, settings, etc.) without a fix family that needs them.
 *
 * This is layer 3 of 4 in the capability model:
 *   raw platform capabilities (adapter-internal, e.g. WordPress's own
 *     `edit_posts`/`edit_pages`/`publish_posts`/`upload_files` flags)
 *   -> platform-native capability model (e.g. `WordPressCapabilities` —
 *      stays platform-specific, never flattened into this type)
 *   -> webioom-level required capability (this type)
 *   -> fix-family execution eligibility (resource-type-specific, resolved
 *      at Apply time — e.g. a 'page' resource needs canEditPages
 *      specifically, not just "some" edit capability — stays inline in
 *      the orchestration layer, e.g. wordpress-fix-actions.ts's applyFix)
 */
export type RequiredIntegrationCapability = 'edit_content' | 'upload_media'

/**
 * A generic snapshot of every webioom-level capability, resolved for the
 * currently connected integration — exactly the two keys
 * RequiredIntegrationCapability has today. This is what
 * lib/fixes/fixability.ts actually receives; it never sees a platform's
 * native capability shape (e.g. WordPress's canEditPages/canEditPosts/
 * canPublishPosts/canUploadMedia) directly. Building this snapshot from a
 * platform's native model is entirely that platform's adapter's
 * responsibility — see lib/integrations/wordpress/adapter.ts's
 * resolveRequiredWordPressCapability, the single source of truth for that
 * translation.
 */
export type IntegrationCapabilitySnapshot = Record<RequiredIntegrationCapability, IntegrationCapabilityState>

/**
 * The smallest normalized connection state core fixability actually
 * branches on today (confirmed against lib/fixes/fixability.ts's existing
 * logic, which only ever consulted two booleans — `wordpressConnected` and
 * `connectionValid` — never WordPress's own 4-value diagnostic state).
 *
 * - 'not_connected': no usable connection exists for this website.
 * - 'connected': a connection exists and was just successfully re-verified
 *   — capabilities may be consulted.
 * - 'needs_attention': a connection exists but could not be confirmed
 *   valid right now (e.g. a revoked credential, or a transient WordPress
 *   REST failure) — execution is not permitted, but this is distinct from
 *   never having connected at all, for wording purposes.
 *
 * This is deliberately an EXECUTION-ELIGIBILITY summary, not a replacement
 * for a platform's own diagnostics. WordPress's finer-grained state
 * ('ok' | 'revoked' | 'unreachable' | 'malformed' — see
 * lib/integrations/wordpress/capabilities.ts's WordPressConnectionState)
 * is untouched and still fully available inside the WordPress layer; it is
 * simply never passed down into core fixability, which never used it.
 */
export type IntegrationConnectionState = 'not_connected' | 'connected' | 'needs_attention'

/*
 * ===========================================================================
 * FRAMEWORK SECURITY INVARIANTS
 * ===========================================================================
 * Documentation only. Nothing below is enforced by this file — enforcement
 * already exists in the modules named, and must stay there; this phase
 * moves no enforcement code. Restated here as the contract every current
 * and future integration (adapter, fix family, or orchestration step) is
 * expected to honor.
 *
 * - Credentials are server-only and encrypted at rest
 *   (lib/security/encryption.ts — untouched by this phase).
 * - Ownership is re-checked server-side on every request, never trusted
 *   from client input or a signed token's claims alone.
 * - Writes require explicit user approval via a signed, opaque preview
 *   token (lib/fixes/preview-token.ts — untouched by this phase) — never a
 *   plain client-submitted value.
 * - Resource identity and capabilities are re-verified fresh immediately
 *   before Apply — never reused from an earlier Prepare call.
 * - Drift is detected before every write and before every Undo: a write
 *   only proceeds if the live state still matches what was expected.
 * - Writes are field-specific and constrained. There is no generic
 *   write(field, value) / updateField(...) / updateResource(...) /
 *   patchResource(...) anywhere in the framework — this is non-negotiable,
 *   not a style preference. Each fix family's write path stays its own
 *   dedicated function, exactly as lib/integrations/wordpress/write-title.ts,
 *   write-meta-description.ts, write-h1-content.ts,
 *   write-image-alt-content.ts, and write-image-alt-media.ts already are.
 * - Every write's response is validated against the exact expected
 *   resource and field value before being reported as successful.
 * - Where applicable, the applied change is verified again against the
 *   public-facing result (lib/fixes/verify-*.ts — untouched by this
 *   phase), independent of what the platform's own API reported.
 * - Every applied (and rolled back) change is recorded in fix_history.
 * - Undo is only performed when the adapter can prove — fresh, at Undo
 *   time — that it is reversing through the exact same mechanism the
 *   original Apply used, not merely a mechanism that is currently valid.
 * - Ambiguous or unknown state fails closed, never open.
 * - Resource identity is never guessed — only ever used after being
 *   confirmed by the platform's own response.
 * - Platform-specific transport protections (SSRF guarding, HTTPS
 *   requirements, redirect restrictions, timeouts) are the adapter's own
 *   responsibility for any future platform, even though a type cannot
 *   enforce a specific implementation.
 * ===========================================================================
 */
