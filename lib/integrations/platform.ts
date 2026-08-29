/**
 * Platform-independent integration vocabulary (Phase 19.2).
 *
 * This module defines TYPES ONLY — no runtime logic, no interfaces, no
 * adapter contracts. It exists so future integration work (Phase 19.3+)
 * has a shared vocabulary to build against, without abstracting anything
 * before a second platform actually justifies it. See the Phase 19.1 audit
 * for the full reasoning behind every choice below.
 *
 * Deliberately deferred out of this phase (documented, not forgotten):
 *
 * - Connection status. The current WordPress connection summary shape
 *   (`connected: boolean` + `connectionValid: boolean` + a 4-value
 *   diagnostic `state: 'ok' | 'revoked' | 'unreachable' | 'malformed'` —
 *   see wordpress-capabilities.ts / lib/integrations/wordpress/capabilities.ts)
 *   does not collapse cleanly into one generic status without either
 *   losing that diagnostic granularity or reshaping WordPress's runtime
 *   return type, which this phase must not do. Revisit in 19.4.
 * - Resource identity. WordPress's own resource vocabulary ('page'/'post',
 *   numeric REST ids, `restBase`) is the only data point available right
 *   now. A generic resource-identity type designed from a single platform
 *   would be speculative by definition. Revisit in 19.3, once the adapter
 *   boundary itself is being built and the real requirement is known.
 * - ConnectionAuthenticator / CapabilityProvider / ResourceResolver /
 *   FieldWriter contracts. No second implementation and no immediate 19.3
 *   need exists yet to justify an interface. Types only, for now.
 */

/**
 * Every platform webioom can integrate with. Today there is exactly one
 * implemented platform. Future adapters extend this union when they are
 * actually built — never in advance of a real implementation.
 */
export type PlatformType = 'wordpress'

/**
 * The generic three-state result of checking whether an integration can do
 * something. Extracted from the WordPress capability model
 * (lib/integrations/wordpress/capabilities.ts's `CapabilityValue`), which
 * already used exactly this vocabulary — this type does not change that
 * file's semantics, only gives the vocabulary a platform-independent home.
 *
 * CRITICAL: 'unknown' must never be treated as 'available'. Every fix
 * family's capability gating fails closed on 'unknown' today (see
 * lib/fixes/fixability.ts's resolveCapabilityValue) — this type exists to
 * preserve that behavior across future adapters, not to relax it.
 */
export type IntegrationCapabilityState = 'available' | 'unavailable' | 'unknown'

/**
 * The webioom-level capability vocabulary fixability rules actually reason
 * about — deliberately smaller than any one platform's native capability
 * set. Extracted from lib/fixes/fixability.ts's `RequiredWordPressCapability`,
 * which the Phase 19.1 audit found was already functioning as this exact
 * layer, just under a WordPress-flavored name.
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
