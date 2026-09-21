import { classifyNotification, type CommunicationSeverity } from '../notification-copy'
import type { MeaningfulChangeReason } from '../notification-rules'

/**
 * Sprint 2, Prompt 2 — STEP 10. Pure email content builder — no I/O, fully
 * unit-testable. Every fact below comes verbatim from an already-persisted
 * monitoring_events row (itself built entirely from Sprint 2 Prompt 1's
 * deterministic ChangeSummary) — this function invents nothing and never
 * makes a claim the underlying comparison doesn't already support. In
 * particular, it never says anything about traffic, rankings, or Google
 * Search Console data, since none of that evidence exists yet.
 *
 * Sprint 3 (monitoring + notifications completion) — now renders a real,
 * premium branded HTML alternative alongside the original plain-text body
 * (kept as the honest, fully-functional fallback — see provider.ts's own
 * doc comment on why `text` is never removed). Classification (severity,
 * headline, summary, highlight lines) is delegated entirely to
 * `classifyNotification` in ../notification-copy — the SAME function the
 * in-app notification bell/panel/center calls — so an email and its
 * in-app counterpart can never say something different about the same
 * event.
 */

export type RenderableFinding = { title: string; severity: string; state: string }

export type RenderableMonitoringEvent = {
  websiteId: string
  websiteName: string
  eventType: 'meaningful_change' | 'monitoring_scan_failed'
  reasons: MeaningfulChangeReason[]
  overallHealthPrevious: number | null
  overallHealthCurrent: number | null
  overallHealthDelta: number | null
  newCount: number
  resolvedCount: number
  worsenedCount: number
  improvedCount: number
  topFindings: RenderableFinding[]
  failureReason: string | null
  appBaseUrl: string
}

export type RenderedEmail = { subject: string; text: string; html: string }

function overviewUrl(event: RenderableMonitoringEvent): string {
  const base = event.appBaseUrl.replace(/\/$/, '')
  return `${base}/dashboard/websites/${event.websiteId}`
}

/**
 * Sprint 2, Prompt 3 security review: `websiteName` is customer-supplied
 * free text (set when the website was added — see app/dashboard/actions.ts's
 * addWebsite), the ONE piece of untrusted input this renderer touches.
 * Every other value here is either server-computed (scores/counts/deltas)
 * or a fixed, developer-authored finding title from a canonical check
 * definition. Stripping control characters (CR/LF in particular) is
 * defense-in-depth against header-injection-style abuse even though the
 * current transport (a single JSON field in an HTTPS API call — see
 * resend-provider.ts) does not construct raw SMTP headers from this value
 * itself.
 */
function sanitizeForEmail(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** HTML-escapes the one piece of untrusted, customer-supplied text (`websiteName`) that reaches the HTML template — every other interpolated value is a server-computed number or a fixed, developer-authored string. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const SEVERITY_ACCENT: Record<CommunicationSeverity, string> = {
  informational: '#2563eb',
  positive: '#16a34a',
  attention: '#d97706',
  important: '#dc2626',
}

const SEVERITY_LABEL: Record<CommunicationSeverity, string> = {
  informational: 'Update',
  positive: 'Good news',
  attention: 'Needs attention',
  important: 'Action required',
}

function renderTextBody(event: RenderableMonitoringEvent, headline: string, summary: string, highlights: string[]): string {
  const lines = [headline, '', event.websiteName, '', summary]
  if (highlights.length > 0) {
    lines.push('', ...highlights)
  }
  if (event.topFindings.length > 0) {
    lines.push('', 'What changed:')
    for (const finding of event.topFindings) {
      lines.push(`- [${finding.severity}] ${finding.title} (${finding.state})`)
    }
  }
  lines.push('', `Review this website: ${overviewUrl(event)}`)
  return lines.join('\n')
}

/**
 * A single, email-client-safe (table-based, inline-styled, no CSS grid/
 * flex, no external stylesheet) transactional template shared by every
 * communication severity — only the accent color, headline, and CTA label
 * change per variant. The dark header uses `bgcolor` + a solid
 * `background-color` alongside the CSS gradient specifically so Outlook's
 * Word rendering engine (which ignores CSS `background: linear-gradient`
 * entirely) still shows the correct dark webioom brand color instead of
 * falling through to a default white — "graceful fallback," not fragile
 * premium.
 */
function renderHtmlBody(
  event: RenderableMonitoringEvent,
  severity: CommunicationSeverity,
  headline: string,
  summary: string,
  highlights: string[],
  ctaLabel: string
): string {
  const accent = SEVERITY_ACCENT[severity]
  const websiteName = escapeHtml(event.websiteName)
  const logoUrl = `${event.appBaseUrl.replace(/\/$/, '')}/brand/webioom-logo-on-dark.png`
  const ctaUrl = overviewUrl(event)

  const highlightRows = highlights
    .map(
      (line) => `
        <tr>
          <td style="padding:6px 0; font-size:14px; line-height:20px; color:#1f2937; border-bottom:1px solid #e2e8f0;">${escapeHtml(line)}</td>
        </tr>`
    )
    .join('')

  const findingRows = event.topFindings
    .map((finding) => {
      const stateLabel = finding.state.charAt(0).toUpperCase() + finding.state.slice(1)
      return `
        <tr>
          <td style="padding:8px 0; border-bottom:1px solid #e2e8f0;">
            <span style="display:inline-block; width:6px; height:6px; border-radius:3px; background-color:${accent}; margin-right:8px;"></span>
            <span style="font-size:13px; color:#1f2937;">${escapeHtml(finding.title)}</span>
            <span style="font-size:12px; color:#94a3b8;"> — ${escapeHtml(stateLabel)}</span>
          </td>
        </tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>webioom</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; border-radius:12px; overflow:hidden;">
            <!-- Dark premium brand header. bgcolor + background-color give Outlook (no CSS gradient support) an honest solid fallback. -->
            <tr>
              <td bgcolor="#12141c" align="center" style="background-color:#12141c; background-image:linear-gradient(90deg,#6D3FF9 0%,#0091FF 38%,#0FB483 68%,#2FBF65 100%); background-repeat:no-repeat; padding:28px 32px 24px;">
                <img src="${logoUrl}" width="132" alt="webioom" style="display:block; border:0; outline:none;" />
                <p style="margin:10px 0 0; font-size:11px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:#f4f6f8;">Where Websites Bloom.</p>
              </td>
            </tr>

            <!-- Light, readable body -->
            <tr>
              <td bgcolor="#ffffff" style="background-color:#ffffff; padding:32px;">
                <p style="margin:0 0 6px; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${accent};">${SEVERITY_LABEL[severity]}</p>
                <h1 style="margin:0 0 4px; font-size:22px; line-height:28px; font-weight:700; color:#0f172a;">${escapeHtml(headline)}</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#64748b;">${websiteName}</p>

                ${
                  highlights.length > 0
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">${highlightRows}</table>`
                    : ''
                }

                <p style="margin:0 0 24px; font-size:14px; line-height:22px; color:#374151;">${escapeHtml(summary)}</p>

                ${
                  event.topFindings.length > 0
                    ? `<p style="margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8;">What changed</p>
                       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${findingRows}</table>`
                    : ''
                }

                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td bgcolor="#0e8c48" style="background-color:#0e8c48; border-radius:6px;">
                      <a href="${ctaUrl}" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${escapeHtml(ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Minimal transactional footer -->
            <tr>
              <td bgcolor="#12141c" align="center" style="background-color:#12141c; padding:20px 32px;">
                <p style="margin:0; font-size:12px; color:#9ca3b4;">webioom &middot; Where Websites Bloom.</p>
                <p style="margin:6px 0 0; font-size:11px; color:#6b7280;">You're receiving this because email notifications are enabled for this website's monitoring.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderMonitoringEmail(rawEvent: RenderableMonitoringEvent): RenderedEmail {
  const event: RenderableMonitoringEvent = { ...rawEvent, websiteName: sanitizeForEmail(rawEvent.websiteName) }
  const classified = classifyNotification({
    eventType: event.eventType,
    reasons: event.reasons,
    overallHealthPrevious: event.overallHealthPrevious,
    overallHealthCurrent: event.overallHealthCurrent,
    overallHealthDelta: event.overallHealthDelta,
    newCount: event.newCount,
    resolvedCount: event.resolvedCount,
    worsenedCount: event.worsenedCount,
    improvedCount: event.improvedCount,
    failureReason: event.failureReason,
  })

  const subject =
    event.eventType === 'monitoring_scan_failed'
      ? `webioom couldn't complete a scheduled scan of ${event.websiteName}`
      : `${classified.headline} — ${event.websiteName}`

  const ctaLabel = event.eventType === 'monitoring_scan_failed' ? 'View website' : 'Review changes'

  return {
    subject,
    text: renderTextBody(event, classified.headline, classified.summary, classified.highlights),
    html: renderHtmlBody(event, classified.severity, classified.headline, classified.summary, classified.highlights, ctaLabel),
  }
}
