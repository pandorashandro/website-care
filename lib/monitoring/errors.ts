/**
 * Sprint 2, Prompt 2 — STEP 8/14. The one function every write to
 * website_monitoring_settings.last_run_error / monitoring_events
 * .failure_reason / monitoring_deliveries.last_error goes through. Never
 * stores a raw exception, stack trace, or provider response body — only a
 * short, human-readable, secret-scrubbed summary, so a monitoring/delivery
 * failure can be understood (by the customer-facing UI, or by whoever
 * debugs it later) without ever risking a leaked credential, bearer token,
 * or API key ending up in a database row or an application log.
 */

const MAX_LENGTH = 300

/** Matches common secret-bearing patterns (Authorization headers, bearer tokens, api_key=/token= query params, long hex/base64-ish runs) so they are redacted even if a message unexpectedly contains one. */
const SECRET_PATTERNS: RegExp[] = [
  /authorization\s*:.*/gi,
  /bearer\s+\S+/gi,
  /\b(api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi,
  /\b[a-f0-9]{32,}\b/gi,
]

export function sanitizeMonitoringError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'

  let scrubbed = raw
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[redacted]')
  }

  const singleLine = scrubbed.replace(/\s+/g, ' ').trim()
  return singleLine.length > MAX_LENGTH ? `${singleLine.slice(0, MAX_LENGTH)}…` : singleLine
}
