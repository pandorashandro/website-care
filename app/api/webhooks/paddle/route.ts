import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyPaddleWebhookSignature } from '@/lib/paddle/webhook-signature'
import { getPaddleConfig } from '@/lib/paddle/config'
import { parsePaddleSubscriptionEventData } from '@/lib/paddle/event-mapping'
import { applyPaddleSubscriptionEvent } from '@/lib/paddle/subscription-sync'

/**
 * The subscription lifecycle events webioom currently acts on. Any other
 * event type Paddle might send to this same notification destination
 * later (transaction.*, customer.*, etc.) is acknowledged with 200 so
 * Paddle never retries it forever, but nothing is applied — adding
 * support for a new event type is adding its name here plus whatever new
 * mapping logic it needs, never a reason to reject or mishandle events
 * webioom doesn't understand yet.
 */
const SUBSCRIPTION_EVENT_TYPES = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.trialing',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'subscription.canceled',
])

/**
 * Paddle's webhook delivery endpoint. NOT registered as a notification
 * destination automatically by this phase — the URL is configured manually
 * in the Paddle dashboard after deployment (see docs/paddle-billing.md).
 *
 * Trust order is strict, mirroring the Shopify webhook route exactly: the
 * RAW body is read and signature-verified BEFORE anything else is trusted
 * — no field of the payload (event type, event data, occurred_at) is ever
 * read until verification has already passed. This is safe specifically
 * because the signature and body arrive together as one TLS-protected
 * request from Paddle's own infrastructure: an attacker who lacks the
 * notification destination's secret cannot produce a valid signature for
 * ANY body, so there is no way to submit a request that passes
 * verification with attacker-chosen event data.
 *
 * Status code contract with Paddle's retry behavior: 200 for anything this
 * handler has fully and correctly handled — applied, reconciled, a
 * deliberately skipped event (unmapped price, a duplicate `event_id`, a
 * stale/out-of-order `occurred_at`, or an event type webioom doesn't act
 * on) — since retrying any of those would never produce a different
 * outcome. 401/400 for verification/parse failures that retrying also
 * cannot fix. 500 is reserved for `'failed'` (a genuine, likely-transient
 * database failure) and `'reconciliation_failed'` (the equal-occurred_at
 * ambiguity path's own fetch/re-derivation/write did not succeed) — the
 * two cases where asking Paddle to retry is actually useful.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('paddle-signature')

  let webhookSecret: string
  try {
    ;({ webhookSecret } = getPaddleConfig())
  } catch {
    // Paddle is not configured at all in this environment — never expose
    // that detail to the caller.
    return new NextResponse(null, { status: 500 })
  }

  const verification = verifyPaddleWebhookSignature(rawBody, signatureHeader, webhookSecret)
  if (!verification.ok) {
    return new NextResponse(null, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  if (!payload || typeof payload !== 'object') {
    return new NextResponse(null, { status: 400 })
  }

  const envelope = payload as Record<string, unknown>
  const eventId = envelope.event_id
  const eventType = envelope.event_type
  const occurredAt = envelope.occurred_at
  const data = envelope.data

  // event_id is Paddle's own documented deduplication key for retried
  // deliveries — required and read from the verified envelope itself,
  // never substituted with notification_id (a different identifier,
  // documented only for tracking individual delivery attempts to a
  // specific destination, not for event deduplication).
  if (typeof eventId !== 'string' || typeof eventType !== 'string' || typeof occurredAt !== 'string' || !data) {
    return new NextResponse(null, { status: 400 })
  }

  if (!SUBSCRIPTION_EVENT_TYPES.has(eventType)) {
    return new NextResponse(null, { status: 200 })
  }

  const parsedData = parsePaddleSubscriptionEventData(data)
  if (!parsedData) {
    // Malformed subscription data webioom cannot safely act on. Acknowledge
    // rather than error — retrying an unparseable payload will never
    // produce a different result, and a 500 here would just cause Paddle
    // to retry indefinitely.
    return new NextResponse(null, { status: 200 })
  }

  const result = await applyPaddleSubscriptionEvent(parsedData, occurredAt, eventId, eventType)

  if (result === 'failed' || result === 'reconciliation_failed') {
    return new NextResponse(null, { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
