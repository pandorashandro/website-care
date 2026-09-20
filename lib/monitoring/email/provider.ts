import 'server-only'
import { createResendEmailProvider } from './resend-provider'

/**
 * Sprint 2, Prompt 3 — STEP 3. The ONE narrow boundary between the
 * monitoring/delivery pipeline and however an email actually gets sent.
 * Every other module in lib/monitoring/ (delivery-service.ts, tests) knows
 * only `EmailProvider`/`EmailMessage`/`EmailSendResult` — no vendor name,
 * request shape, or response shape from any specific provider ever leaks
 * past this file. Swapping providers in the future means writing one new
 * `create<Vendor>EmailProvider` alongside resend-provider.ts and changing
 * ONLY the `getEmailProvider` selection below — nothing else in the
 * monitoring domain would need to change.
 */
export type EmailMessage = {
  to: string
  subject: string
  text: string
}

export type EmailSendResult = { ok: true; providerMessageId?: string } | { ok: false; error: string }

export type EmailProvider = {
  send(message: EmailMessage): Promise<EmailSendResult>
}

/**
 * The default (and, today, the ONLY) provider — always fails cleanly and
 * honestly. Never silently "succeeds" without actually sending anything,
 * which would let a delivery row falsely show `status: 'sent'` when no
 * email was ever delivered — see delivery-service.ts, which persists this
 * exact failure reason to `monitoring_deliveries.last_error` rather than
 * treating it as a success.
 */
export const NullEmailProvider: EmailProvider = {
  async send(): Promise<EmailSendResult> {
    return { ok: false, error: 'No email provider is configured for this environment.' }
  },
}

/**
 * Sprint 2, Prompt 3 — STEP 3. Resolves the real provider once the two
 * required environment variables are actually set:
 * `RESEND_EMAIL_API_KEY` (the provider's server-only API key) and
 * `MONITORING_EMAIL_FROM_ADDRESS` (a verified sending identity on that
 * provider's account — see resend-provider.ts's own doc comment). Chosen
 * because its transactional-send API is a single authenticated HTTPS POST
 * with a JSON body — no SDK, no new npm dependency, and no vendor-specific
 * concept leaks past this function.
 *
 * FAILS CLOSED: either variable missing (the case in every environment
 * today — neither is set anywhere, confirmed by this sprint's own audit)
 * returns NullEmailProvider, so a delivery attempt in an unconfigured
 * environment fails honestly rather than silently no-op-"succeeding."
 */
export function getEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_EMAIL_API_KEY
  const fromAddress = process.env.MONITORING_EMAIL_FROM_ADDRESS

  if (!apiKey || !fromAddress) return NullEmailProvider

  return createResendEmailProvider(apiKey, fromAddress)
}
