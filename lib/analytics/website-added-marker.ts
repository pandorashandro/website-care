/**
 * WEBIOOM Product Analytics — `website_added` redirect-marker contract.
 *
 * `addWebsite` (app/dashboard/actions.ts) is a Server Action that
 * `redirect()`s on success rather than returning a value `useActionState`
 * could observe — Next's `redirect()` throws internally, and nothing after
 * it in that function ever runs. That leaves the browser with no return
 * value to detect "a website was just genuinely created" from.
 *
 * The fix is a one-time, single-use signal carried in the redirect target's
 * own query string: `addWebsite` appends this param to the URL it redirects
 * to only on its final success path (after entitlement/post-insert
 * validation both passed), and `components/analytics/track-website-added.tsx`
 * (mounted on that same page) looks for it, fires `website_added` exactly
 * once, then strips it from the visible URL via `history.replaceState` — so
 * a refresh, a later revisit, or someone else opening the same website
 * directly never sees the marker and never re-fires the event.
 *
 * This constant is the ONLY place the param's name is spelled out, shared
 * by both the server (which sets it) and the client (which consumes it) —
 * it carries no user data, no website ID, and no identifying value beyond a
 * fixed literal.
 */
export const WEBSITE_ADDED_QUERY_PARAM = 'webioom_added'
export const WEBSITE_ADDED_QUERY_VALUE = '1'
