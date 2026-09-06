import 'server-only'
import { getPaddleConfig } from './config'

const REQUEST_TIMEOUT_MS = 10_000

export type PaddleApiResult =
  | { ok: true; status: number; data: unknown }
  | {
      ok: false
      reason: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_request' | 'timeout' | 'network' | 'malformed_response' | 'unexpected_status'
      status?: number
    }

/**
 * Sole HTTP primitive for authenticated Paddle REST API calls. Mirrors
 * lib/integrations/wix/client.ts's fetchWixApi structure exactly (same
 * timeout/abort handling, same structured failure reasons, same
 * `redirect: 'error'`). Paddle's API host is fixed per environment
 * (sandbox-api.paddle.com / api.paddle.com — see config.ts), never
 * merchant/user-supplied, so no per-call SSRF hostname guard is needed
 * here either. Every successful Paddle response is wrapped as `{"data":
 * ..., "meta": {...}}` (confirmed from developer.paddle.com) — this
 * function unwraps that envelope so every caller works with the resource
 * itself, never the wrapper.
 */
export async function fetchPaddleApi(path: string, init?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown }): Promise<PaddleApiResult> {
  const { apiKey, baseUrl } = getPaddleConfig()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 401) return { ok: false, reason: 'unauthorized', status: response.status }
  if (response.status === 403) return { ok: false, reason: 'forbidden', status: response.status }
  if (response.status === 404) return { ok: false, reason: 'not_found', status: response.status }
  if (response.status === 400) return { ok: false, reason: 'invalid_request', status: response.status }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: 'unexpected_status', status: response.status }
  }

  let parsed: unknown
  try {
    parsed = response.status === 204 ? {} : await response.json()
  } catch {
    return { ok: false, reason: 'malformed_response', status: response.status }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'malformed_response', status: response.status }
  }

  return { ok: true, status: response.status, data: (parsed as Record<string, unknown>).data }
}

export type CreatePaddleTransactionResult =
  | { ok: true; transactionId: string; checkoutUrl: string | null }
  | { ok: false; reason: 'invalid_request' | 'provider_error' }

/**
 * Creates a Paddle transaction for a single subscription price — the
 * server-side building block a future checkout frontend (Phase 23.3) will
 * pass to Paddle.js as a `transactionId` to open the checkout overlay,
 * rather than letting the browser call Paddle.Checkout.open with raw
 * items/customData itself. This is deliberately the safer of the two
 * patterns Paddle's docs describe: `custom_data` (which carries webioom's
 * trusted user id — see event-mapping.ts) is set HERE, server-side, and
 * can never be tampered with by the browser the way a client-supplied
 * customData object could be.
 */
export async function createPaddleTransaction(params: {
  priceId: string
  customData: Record<string, unknown>
  customerId?: string
}): Promise<CreatePaddleTransactionResult> {
  const result = await fetchPaddleApi('/transactions', {
    method: 'POST',
    body: {
      items: [{ price_id: params.priceId, quantity: 1 }],
      custom_data: params.customData,
      collection_mode: 'automatic',
      ...(params.customerId ? { customer_id: params.customerId } : {}),
    },
  })

  if (!result.ok) {
    return { ok: false, reason: result.reason === 'invalid_request' ? 'invalid_request' : 'provider_error' }
  }

  const data = result.data
  if (!data || typeof data !== 'object') return { ok: false, reason: 'provider_error' }

  const id = (data as Record<string, unknown>).id
  const checkout = (data as Record<string, unknown>).checkout
  const checkoutUrl = checkout && typeof checkout === 'object' ? (checkout as Record<string, unknown>).url : null

  if (typeof id !== 'string') return { ok: false, reason: 'provider_error' }

  return { ok: true, transactionId: id, checkoutUrl: typeof checkoutUrl === 'string' ? checkoutUrl : null }
}

export type CreatePaddlePortalSessionResult = { ok: true; url: string } | { ok: false; reason: 'not_found' | 'provider_error' }

/**
 * Creates a single-use, short-lived authenticated Paddle customer portal
 * link for an EXISTING Paddle customer. `customerId` must always be a
 * value the caller already read from webioom's own `subscriptions` row
 * (this user's own `provider_customer_id`) — never accepted from the
 * browser (see app/dashboard/billing-actions.ts's createBillingPortalSession,
 * the only caller). Reads `data.urls.general.overview` per Paddle's
 * documented response shape; any other shape fails closed rather than
 * returning a guessed or partially-parsed URL.
 */
export async function createPaddleCustomerPortalSession(customerId: string): Promise<CreatePaddlePortalSessionResult> {
  const result = await fetchPaddleApi(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: 'POST',
    body: {},
  })

  if (!result.ok) {
    return { ok: false, reason: result.reason === 'not_found' ? 'not_found' : 'provider_error' }
  }

  const data = result.data
  if (!data || typeof data !== 'object') return { ok: false, reason: 'provider_error' }

  const urls = (data as Record<string, unknown>).urls
  const general = urls && typeof urls === 'object' ? (urls as Record<string, unknown>).general : null
  const overview = general && typeof general === 'object' ? (general as Record<string, unknown>).overview : null

  if (typeof overview !== 'string') return { ok: false, reason: 'provider_error' }

  return { ok: true, url: overview }
}

export type FetchPaddleSubscriptionResult = { ok: true; data: unknown } | { ok: false; reason: 'not_found' | 'provider_error' }

/**
 * Fetches Paddle's own CURRENT, authoritative state for one subscription
 * (`GET /subscriptions/{id}`, confirmed from developer.paddle.com to
 * return the same shape a subscription webhook's `data` field does —
 * status, items[].price.id, current_billing_period.ends_at,
 * items[].trial_dates.ends_at, custom_data — so the exact same
 * `parsePaddleSubscriptionEventData`/`mapPaddleSubscriptionEvent` pipeline
 * a webhook uses can parse this response too). The ONLY caller is
 * lib/paddle/subscription-sync.ts's reconciliation path, used exclusively
 * to resolve the documented "two distinct events share an identical
 * occurred_at" ambiguity — never used to originate a subscription-state
 * change on its own. Requires the API key to have `subscription.read`
 * permission (a standard Paddle API key scope, not a special grant).
 */
export async function fetchPaddleSubscription(subscriptionId: string): Promise<FetchPaddleSubscriptionResult> {
  const result = await fetchPaddleApi(`/subscriptions/${encodeURIComponent(subscriptionId)}`)

  if (!result.ok) {
    return { ok: false, reason: result.reason === 'not_found' ? 'not_found' : 'provider_error' }
  }

  return { ok: true, data: result.data }
}
