# Wix API research (Prompt 1, September 2026)

Concise record of the current official Wix developer documentation
findings this foundation is built against, and the decisions they drove.
Sources are `dev.wix.com` pages fetched live during this phase — not
memory. Re-verify against live docs before Beta if a meaningful gap of
time has passed.

## 1. Authentication model — OAuth Client Credentials, NOT authorization-code

Wix's current (2026) recommended model for a new third-party app is
**OAuth Client Credentials**: `POST https://www.wixapis.com/oauth2/token`
with `{grant_type: 'client_credentials', client_id: <appId>, client_secret:
<appSecret>, instance_id: <instanceId>}` returns a bearer access token
valid 4 hours. **There is no refresh token in this model** — a fresh
access token is simply re-minted on demand using the same three values.

The alternative — "Custom Authentication (legacy)" — uses an
authorization-code exchange producing a **permanent, non-expiring refresh
token** per installation, and supports redirecting the user to an external
URL during install. Wix's own docs state explicitly: **"Custom
authentication is no longer available for new apps."** webioom, as a new
app, cannot use it. This rules out a Shopify-shaped
access-token+refresh-token-pair persistence model for Wix entirely — see
§5 (database) for what this simplifies.

Source: [About OAuth](https://dev.wix.com/docs/build-apps/develop-your-app/access/authentication/about-oauth), [Authenticate Using OAuth](https://dev.wix.com/docs/build-apps/develop-your-app/access/authentication/authenticate-using-oauth), [About the OAuth 2 API](https://dev.wix.com/docs/api-reference/app-management/oauth-2/introduction).

## 2. Install flow — the External Install Flow (current, non-legacy)

Despite the above, Wix **does** currently support a state-tracked,
custom-redirect install flow — it's just a separate mechanism from Custom
Auth, called the **External Install Flow**, and it's compatible with the
Client Credentials model:

1. webioom builds `https://www.wix.com/app-installer?appId=<APP_ID>&postInstallationUrl=<url-encoded callback, itself carrying a `state` query param>`.
2. The site owner completes the standard Wix install flow.
3. Wix redirects the browser to our `postInstallationUrl`, appending `appId`, `tenantId` (the Wix **site ID**), `instanceId` (the permanent per-installation identifier), `signedInstance` (a signed proof of the install), and preserves our own `state` param unchanged.

**Security deviation from Wix's own sample code, deliberate:** Wix's docs
put raw business data (`{userId, returnTo}`) directly in the `state` query
param. webioom instead generates a single-use, cryptographically random,
server-stored opaque state token — exactly the pattern already used for
Shopify's `shopify_oauth_states` — bound server-side to `user_id` +
`website_id` + an expiry, and passes only that opaque token as `state`.
This is strictly more secure (no business data or PII ever appears in a
browser-visible URL/referer) and costs nothing extra.

Source: [About the External Install Flow](https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/install-your-app/about-the-external-install-flow), [Set Up the External Install Flow](https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/install-your-app/set-up-the-external-install-flow).

## 3. `signedInstance` verification — a documented gap, resolved conservatively

Wix's docs explicitly warn: *"the `instanceId` on its own isn't proof of a
successful install... verify `signedInstance` before you trust
`instanceId`."* The **currently recommended** verification path is to call
the **Token Info** REST endpoint and let Wix validate the token
server-side. Fetching that endpoint's exact request/response schema during
this research repeatedly returned an unrelated legacy example rather than
a clean schema — **this is a confirmed documentation gap, not an
assumption papered over.**

What **is** fully and consistently specified (with working Node.js, PHP,
Java, and Ruby code samples) is the legacy `instance` query-parameter
format: `<base64url HMAC-SHA256 signature>.<base64 JSON payload>`, signed
with the app secret. This is explicitly marked "legacy" for one specific
use (decoding the iframe `instance` parameter), but is the only mechanism
Wix documents with byte-level precision anywhere in scope for this phase.

**Decision:** implement HMAC-SHA256 verification of `signedInstance` using
this documented format (`lib/integrations/wix/install.ts`'s
`verifyWixSignedInstance`), and additionally cross-check the decoded
payload's `instanceId`/`siteId` against the plain-text `instanceId`/
`tenantId` query parameters Wix also sends — any mismatch fails closed.
This mirrors the two-layer verification pattern already established for
Shopify (HMAC check, then a live identity-confirmation call). **Confirming
this exact byte format against a real Wix install (and/or switching to a
live Token Info call once its schema is confirmed) is required before
Beta** — see the final report's live-testing section.

Source: [Set Up the External Install Flow](https://dev.wix.com/docs/build-apps/launch-your-app/app-distribution/install-your-app/set-up-the-external-install-flow), [Parse the App Instance Query Parameter](https://dev.wix.com/docs/build-apps/develop-your-app/auth/app-instances/parse-the-app-instance-query-parameter) (legacy-marked, but the only fully-specified format found), [Token Info](https://dev.wix.com/docs/api-reference/app-management/oauth-2/token-info) (recommended path; schema not confirmed this phase).

## 4. Webhooks (uninstall) — JWT signed with a public/private keypair, NOT HMAC

Separately from `signedInstance`, ongoing webhooks (including **App
Instance Removed**, the uninstall signal) are delivered as a **signed JWT**
in the request body, verified against a **public key** obtained from the
app dashboard's Webhooks page — an asymmetric scheme, distinct from
`signedInstance`'s shared-secret HMAC. This mirrors Shopify's own pattern
of using two genuinely different, non-interchangeable verification
mechanisms for two different mechanisms (there, OAuth-callback HMAC vs.
webhook HMAC; here, install HMAC vs. webhook JWT) — another reason to keep
them as separate, clearly-named functions rather than one shared verifier.

**Decision for this phase:** the uninstall webhook route is documented and
stubbed with a clear TODO rather than fully implemented, because
JWT/public-key verification requires the app's actual public key (issued
per real app registration in the Wix dashboard) and a decision on which
JWT library to depend on — both are real product/dependency decisions, not
"ordinary" ones, so implementing them with a placeholder key would risk
shipping a webhook receiver that silently accepts unverified payloads.
This is flagged explicitly in the final report as remaining work, not
silently deferred.

Source: [About Webhooks](https://dev.wix.com/docs/build-apps/develop-your-app/api-integrations/events-and-webhooks/about-webhooks), [App Instance Removed](https://dev.wix.com/docs/api-reference/app-management/app-instance/app-instance-removed), [App Instance Installed](https://dev.wix.com/docs/api-reference/app-management/app-instance/app-instance-installed).

## 5. Site identity

The account-level **Sites API**'s `Site` object gives everything needed
for domain-mismatch checks and Editor-type awareness: `id` (site ID,
matches the install callback's `tenantId`), `viewUrl` (the live public
URL — the Wix analogue of Shopify's `myshopifyDomain`), `editorType`
(`EDITOR` = classic Wix Editor, `STUDIO`/`STUDIO_TWO` = Wix Studio, `ADI` =
Wix ADI, plus several internal/legacy values) — confirming the Wix
Editor/Studio distinction the brief asked about is real and visible.
`published`/`domainConnected` give further connection-health signal.

Source: [Site Object](https://dev.wix.com/docs/api-reference/account-level/sites/sites/site-object).

## 6. Resource mapping — a genuine, evidenced per-resource-type split

Wix's **Item SEO Tags API** (`GET/PUT
https://www.wixapis.com/promote/seo/v1/item-seo-tags/{itemType}/...`)
reads/writes an item's title, meta description, and other tags, addressed
by `(itemType, itemId)` — e.g. `STATIC_PAGE`, `BLOG_POST`,
`STORES_PRODUCT`. Critically, **items are addressed by ID, not URL, and
`List Item SEO Tags` returns no URL/slug field at all** — confirmed by
reading its full response schema. Wix's top-level API Reference index
(confirmed by direct inspection) has **no dedicated "Pages" REST API
category** — page/site-structure listing exists only via Velo (in-site
code), which a self-managed external backend cannot call.

This means URL → item identity resolution is **only** provable for item
types that have their own dedicated "get by slug" endpoint:

- **`BLOG_POST`**: [Get Post By Slug](https://dev.wix.com/docs/api-reference/business-solutions/blog/posts-stats/get-post-by-slug) exists, `slug` is confirmed to be "used in the post's URL path" → **resolvable**.
- **`STORES_PRODUCT`**: [Get Product By Slug](https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/products-v3/get-product-by-slug) exists, `slug` is confirmed to be "auto-generated from the product name and used in the product's URL path" → **resolvable**.
- **`STATIC_PAGE`**: **no REST endpoint found that maps a URL/path/slug to a static page's item ID.** This is not a guess or an oversight — it's the direct result of the Pages-API gap above. Guessing at an ID (e.g. by matching a page's SEO title against a scanned `<title>`) would be exactly the kind of unproven identity match this codebase's own philosophy (Shopify Image Alt, WordPress's every resource-mapping module) already refuses to do elsewhere. **`STATIC_PAGE` resource mapping is UNSUPPORTED, fails closed, and is not implemented.**

This is a real, meaningful limitation (static pages are extremely common
on small-business Wix sites) but is the honest conclusion the evidence
supports — see the Definition of Done's explicit instruction not to force
unsupported resource types.

Source: [About the Item SEO Tags API](https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/introduction), [List Item SEO Tags](https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/list-item-seo-tags), [dev.wix.com/docs/api-reference](https://dev.wix.com/docs/api-reference) (top-level index — no Pages category).

## 7. Fix family classification — evidence, not assumption

- **Title / Meta Description** (`BLOG_POST`, `STORES_PRODUCT` only —
  `STATIC_PAGE` blocked by §6): the Item SEO Tags API's `tags` array
  supports a `title` tag type and a `meta` tag (`props: {name:
  "description", content: "..."}`), both directly readable (as part of
  `resolvedTags`, which reports the actually-rendered value with its
  source) and writable (via the item's own `tags`). **DIRECT-FIX
  CANDIDATE.** Two Wix-specific mutation constraints, evidenced directly
  from the schema, that Prompt 2's Apply logic must respect: (a) tags can
  only be written for the site's **primary language** — sending any other
  `language` fails with `LANGUAGE_NOT_SUPPORTED`; (b) `STATIC_PAGE` keeps
  a separate draft/published revision requiring `publish: true` to go
  live, but since `STATIC_PAGE` is unsupported for resource mapping this
  doesn't currently apply — `BLOG_POST` and `STORES_PRODUCT` publish
  immediately with no draft step, confirmed by the schema's own
  `PublishStatus` documentation.
- **H1**: no API was found for reading or writing arbitrary page heading
  content — Wix page content is Editor/Velo-mediated, with no REST
  surface for a self-managed backend app, structurally the same class of
  gap that made Shopify's H1 theme-mediated and unprovable. **GUIDED /
  MANUAL.**
- **Image Alt**: two independent, compounding gaps. First, the same
  identity-resolution gap as Title/Meta for `STATIC_PAGE`, and no
  file-level mapping exists for a scanned public image URL either.
  Second — and this is stronger than Shopify's blocker — Wix Help Center
  documentation states plainly that alt text **cannot currently be added
  through the Media Manager (file-level) API/UI at all; alt text is set
  per image placement in the Editor.** There is no confirmed REST mutation
  path for that per-placement value at all, not just an identity-proof
  gap. **UNSUPPORTED / UNPROVEN** — stronger evidence than the Shopify
  Image Alt deferral, not weaker.

Source: [List Item SEO Tags](https://dev.wix.com/docs/api-reference/business-management/seo/item-seo-tags-v1/list-item-seo-tags) (full schema, `tags`/`resolvedTags`/`publishStatus`/`language` fields), [About the Media API](https://dev.wix.com/docs/api-reference/assets/media/media-manager/introduction), [Wix Media Request: Adding Alt Text in the Media Manager](https://support.wix.com/en/article/wix-media-request-adding-alt-text-in-the-media-manager).

## 7.5. Domain/URL confirmation — NOT currently provable (a real, evidenced gap)

Shopify's resource mapping independently confirms the connected shop's
own domain (`hostnameMatchesStoreIdentity`) before ever trusting a
resolved resource. Wix has no equivalent for a third-party app:

- The account-level **Sites API** (`Site.viewUrl`) would give exactly
  this, but its own introduction states plainly: **"This API is
  accessible only when authenticated as a Wix user or by using an account
  level API key"** — and Wix's own auth docs state API keys **"aren't
  available for use in third-party Wix apps."** App-instance Client
  Credentials tokens cannot call it. Confirmed by direct inspection, not
  inferred.
- The **Site Properties** API (`Properties` object) is reachable, but its
  only URL-shaped field is `externalSiteUrl`, explicitly documented as
  "External site URL that uses Wix as its headless business solution" —
  i.e. only meaningful for headless Wix deployments, not a general
  "this site's public domain" field for an ordinary Wix-hosted site.

**Conclusion:** there is currently no accessible Wix API that lets
webioom independently confirm "the site behind this `instanceId` serves
domain X." This is a materially different risk shape than Shopify's,
not merely a missing nice-to-have: Shopify's domain check exists because
a merchant *types* a shop domain that could be mistyped or spoofed;
Wix's External Install Flow has no equivalent free-text domain entry at
all — the user is redirected through Wix's own site picker, and
`tenantId`/`instanceId` (cryptographically proven via `signedInstance`)
already identify exactly which site was chosen. So the practical
consequence is narrower than it first sounds: it means webioom cannot
independently double-check a Wix connection's site identity against a
stored URL the way it can for Shopify, not that the connection's site
identity itself is unproven. This is recorded here so Prompt 2 doesn't
attempt to build a `hostnameMatchesStoreIdentity`-equivalent check against
an API that cannot support it.

## 8. Permission model

Permissions are declared **once, app-wide**, in the app dashboard — not
requested dynamically per-install the way Shopify's OAuth `scope` query
parameter is. A site owner approves the app's entire fixed permission set
at install time; there is no evidence of a live "list of scopes granted to
this specific instance, right now" introspection call analogous to
Shopify's `currentAppInstallation.accessScopes` (Token Info may serve this
role — see §3's documented gap). Capability evaluation for Prompt 2
therefore should treat "the app itself is approved with the needed
permission" as the primary signal and rely on Wix's own API responses
(`403`/permission-denied errors) as the fail-closed backstop at Prepare/
Apply time — exactly the same "attempt, then fail closed on rejection"
posture WordPress's REST calls already use, not a new pattern.

Source: [About Permissions](https://dev.wix.com/docs/build-apps/develop-your-app/auth/permissions/about-permissions).

## 9. `www.wixapis.com` requires no SSRF guarding for authenticated calls

Unlike Shopify (where every authenticated call targets a merchant-chosen
`{shop}.myshopify.com` hostname, requiring the SSRF guard `client.ts`
already implements), every Wix Admin API call targets the fixed,
Wix-owned host `www.wixapis.com` — never a value derived from user/merchant
input. `lib/integrations/wix/client.ts` therefore does not need (and does
not implement) per-call hostname SSRF validation; it still uses a bounded
timeout and `redirect: 'error'` as basic transport hygiene. SSRF guarding
remains fully necessary — and unchanged — for the one part of the Wix flow
that DOES fetch a value derived from the connected site: public-page
verification, which will reuse the scanner's existing hardened `fetchPage`
exactly as Shopify's verifier already does (not implemented this phase —
no mutations exist yet to verify).
