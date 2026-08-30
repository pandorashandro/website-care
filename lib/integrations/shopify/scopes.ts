import 'server-only'
import { fetchShopifyGraphQL, type ShopifyGraphQLResult } from './client'

/**
 * The Shopify access-scope handles this integration currently requests
 * (Phase 20.1A: read_content, write_content, read_products, write_products)
 * or has a concretely planned future use for (read_files/write_files —
 * the CURRENT, non-deprecated mechanism for Product media alt text via
 * fileUpdate, confirmed this phase; not yet requested in OAuth, not yet
 * granted, modeled here only so capability evaluation can correctly report
 * `missing_scope` for Product Image Alt today rather than pretending it
 * doesn't exist). Deliberately not a giant enum of every Shopify scope —
 * only ones this integration has a real or concretely planned reason to
 * check.
 */
export type ShopifyGrantedScope = 'read_products' | 'write_products' | 'read_content' | 'write_content' | 'read_files' | 'write_files'

export type ShopifyGrantedScopeSet = ReadonlySet<ShopifyGrantedScope>

const KNOWN_SCOPES: ReadonlySet<ShopifyGrantedScope> = new Set<ShopifyGrantedScope>([
  'read_products',
  'write_products',
  'read_content',
  'write_content',
  'read_files',
  'write_files',
])

/**
 * Parses a raw list of scope handle strings into a typed set. Exact
 * matching only — a raw string is included only if it is byte-identical
 * to one of the known handles; no substring, prefix, or fuzzy matching is
 * ever performed anywhere in this module. Unknown/unrecognized entries are
 * silently dropped rather than included, which is the fail-closed
 * direction: an unexpected string can never grant a capability it doesn't
 * actually name.
 */
export function parseShopifyGrantedScopes(rawScopes: readonly string[]): ShopifyGrantedScopeSet {
  const scopes = new Set<ShopifyGrantedScope>()
  for (const raw of rawScopes) {
    if ((KNOWN_SCOPES as ReadonlySet<string>).has(raw)) {
      scopes.add(raw as ShopifyGrantedScope)
    }
  }
  return scopes
}

/** Parses the stored, comma-separated `shopify_connections.granted_scopes` column value — see this module's doc comment on why this is metadata, not the source of truth for a write decision. */
export function parseStoredShopifyScopes(commaSeparated: string): ShopifyGrantedScopeSet {
  return parseShopifyGrantedScopes(
    commaSeparated
      .split(',')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0)
  )
}

export function hasScope(scopes: ShopifyGrantedScopeSet, scope: ShopifyGrantedScope): boolean {
  return scopes.has(scope)
}

export function hasAllScopes(scopes: ShopifyGrantedScopeSet, required: readonly ShopifyGrantedScope[]): boolean {
  return required.every((scope) => scopes.has(scope))
}

export function hasAnyScope(scopes: ShopifyGrantedScopeSet, candidates: readonly ShopifyGrantedScope[]): boolean {
  return candidates.some((scope) => scopes.has(scope))
}

/** Returns exactly the members of `required` not present in `scopes`, in the order given. */
export function missingScopes(required: readonly ShopifyGrantedScope[], scopes: ShopifyGrantedScopeSet): ShopifyGrantedScope[] {
  return required.filter((scope) => !scopes.has(scope))
}

export type ShopifyGrantedScopesResult = { ok: true; scopes: ShopifyGrantedScopeSet } | Extract<ShopifyGraphQLResult, { ok: false }>

const CURRENT_ACCESS_SCOPES_QUERY = `query WebioomCurrentAccessScopes {
  currentAppInstallation {
    accessScopes {
      handle
    }
  }
}`

/**
 * Fetches the CURRENTLY granted scopes fresh, directly from Shopify —
 * confirmed via current official docs to require no scope of its own, so
 * it can always be called regardless of what else is or isn't granted.
 * This, not the stored `granted_scopes` column, is the authoritative
 * source of truth for any security-sensitive capability decision (see
 * capabilities.ts) — a merchant can change an app's granted scopes at any
 * time independent of webioom's own token-refresh cadence, and the stored
 * column only reflects what was true as of the last OAuth exchange or
 * refresh, not necessarily right now.
 */
export async function getGrantedShopifyScopes(shopDomain: string, accessToken: string): Promise<ShopifyGrantedScopesResult> {
  const result = await fetchShopifyGraphQL(shopDomain, accessToken, CURRENT_ACCESS_SCOPES_QUERY)
  if (!result.ok) return result

  const installation = result.data.currentAppInstallation
  if (!installation || typeof installation !== 'object') return { ok: false, reason: 'malformed_response' }

  const accessScopes = (installation as Record<string, unknown>).accessScopes
  if (!Array.isArray(accessScopes)) return { ok: false, reason: 'malformed_response' }

  const handles: string[] = []
  for (const entry of accessScopes) {
    if (!entry || typeof entry !== 'object') return { ok: false, reason: 'malformed_response' }
    const handle = (entry as Record<string, unknown>).handle
    if (typeof handle !== 'string') return { ok: false, reason: 'malformed_response' }
    handles.push(handle)
  }

  return { ok: true, scopes: parseShopifyGrantedScopes(handles) }
}
