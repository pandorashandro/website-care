import 'server-only'
import type { EmailProvider, EmailMessage, EmailSendResult } from './provider'

/**
 * Sprint 2, Prompt 3 — STEP 3. A production-capable EmailProvider backed
 * by Resend's transactional-send HTTPS API — a single authenticated JSON
 * POST, so this needed no new npm dependency (`fetch`/`AbortSignal` are
 * both already available in this Next.js runtime). This is the ONLY file
 * in the codebase that knows Resend's request/response shape; everything
 * else talks to it exclusively through the generic EmailProvider interface
 * (see provider.ts's own doc comment).
 *
 * EXTERNAL SETUP STILL REQUIRED (not performed by this code, and never
 * faked as done): a Resend account, a verified sending domain on that
 * account, and its API key set as `RESEND_EMAIL_API_KEY` — see this
 * sprint's own final report for the exact steps. `MONITORING_EMAIL_FROM_ADDRESS`
 * must be an address on that verified domain (Resend rejects sends from an
 * unverified domain).
 */

const RESEND_API_URL = 'https://api.resend.com/emails'
const REQUEST_TIMEOUT_MS = 10_000

type ResendSuccessBody = { id?: string }
type ResendErrorBody = { message?: string; name?: string }

/**
 * Never includes the raw response body verbatim in the returned error —
 * only its own `message`/`name` fields, both plain provider-authored
 * prose describing what went wrong (e.g. "Invalid `to` field"), never a
 * value round-tripped from THIS REQUEST's own headers/body, so there is no
 * path for the Authorization header or api key used to make the call to
 * end up echoed back into a stored error string. delivery-service.ts's own
 * sanitizeMonitoringError call is still applied on top of whatever this
 * returns, as defense in depth.
 */
function describeResendFailure(status: number, body: ResendErrorBody | null): string {
  if (body?.message) return `Resend rejected the request (${status}): ${body.message}`
  return `Resend request failed with status ${status}.`
}

export function createResendEmailProvider(apiKey: string, fromAddress: string): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      let response: Response
      try {
        response = await fetch(RESEND_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (err) {
        const timedOut = err instanceof Error && err.name === 'TimeoutError'
        return { ok: false, error: timedOut ? 'Email provider request timed out.' : 'Email provider request could not be sent.' }
      }

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        return { ok: false, error: describeResendFailure(response.status, body as ResendErrorBody | null) }
      }

      const successBody = body as ResendSuccessBody | null
      return { ok: true, providerMessageId: typeof successBody?.id === 'string' ? successBody.id : undefined }
    },
  }
}
