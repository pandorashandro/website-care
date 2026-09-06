import 'server-only'
import type { PaddlePriceMapping } from './plan-mapping'

export type PaddleEnvironment = 'sandbox' | 'production'

export type PaddleConfig = {
  apiKey: string
  environment: PaddleEnvironment
  baseUrl: string
  webhookSecret: string
}

const SANDBOX_BASE_URL = 'https://sandbox-api.paddle.com'
const PRODUCTION_BASE_URL = 'https://api.paddle.com'

/**
 * Reads and validates the server-only Paddle configuration. Throws a
 * generic Error (never logging the actual values) if anything required is
 * missing or malformed — callers must treat that as "Paddle unavailable"
 * rather than let it crash a request unexpectedly, mirroring
 * lib/integrations/wix/config.ts's getWixAppConfig exactly.
 *
 * `PADDLE_WEBHOOK_SECRET` is the notification destination's own secret key
 * (generated when a webhook destination is configured in the Paddle
 * dashboard) — a genuinely different value from `PADDLE_API_KEY`, which
 * authenticates outbound REST calls. Confusing the two would silently
 * break webhook signature verification rather than error loudly, so both
 * are required here rather than one substituting for the other.
 */
export function getPaddleConfig(): PaddleConfig {
  const apiKey = process.env.PADDLE_API_KEY
  const environment = process.env.PADDLE_ENVIRONMENT
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET

  if (!apiKey || !webhookSecret) {
    throw new Error('Paddle configuration is not fully set.')
  }

  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('PADDLE_ENVIRONMENT must be "sandbox" or "production".')
  }

  return {
    apiKey,
    environment,
    baseUrl: environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL,
    webhookSecret,
  }
}

/**
 * The one trusted, server-only source of "which Paddle price ID does each
 * webioom paid plan currently sell through." Read fresh from environment
 * variables on every call — never cached, never hardcoded in source, and
 * never accepted from a browser or a webhook payload (see
 * lib/paddle/plan-mapping.ts's resolvePaddlePriceId/derivePlanFromPriceId,
 * which are the only functions that ever consult this mapping). A plan
 * with no configured price ID (including `free`, which never has one)
 * resolves to `null` here — every caller must treat `null` as "this plan
 * cannot be checked out" or "this price does not belong to any known
 * plan," never guess or fall back to a different plan.
 */
export function getPaddlePriceMapping(): PaddlePriceMapping {
  return {
    bloom: process.env.PADDLE_BLOOM_PRICE_ID || null,
    bloom_pro: process.env.PADDLE_BLOOM_PRO_PRICE_ID || null,
  }
}
