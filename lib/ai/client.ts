import 'server-only'

const REQUEST_TIMEOUT_MS = 10_000
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

export type AiCompletionFailureReason =
  | 'not_configured'
  | 'timeout'
  | 'network'
  | 'auth'
  | 'rate_limited'
  | 'provider_error'
  | 'malformed_response'

export type AiCompletionResult = { ok: true; text: string } | { ok: false; reason: AiCompletionFailureReason }

function extractText(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null

  const content = (parsed as Record<string, unknown>).content
  if (!Array.isArray(content) || content.length === 0) return null

  const first = content[0]
  if (!first || typeof first !== 'object') return null

  const text = (first as Record<string, unknown>).text
  return typeof text === 'string' ? text : null
}

/**
 * The only module in the codebase that talks to an AI provider. Deliberately
 * a thin, provider-specific wrapper (raw fetch, no SDK) rather than something
 * imported directly by feature code — callers only ever see this generic
 * completion shape, so swapping providers later is localized to this one
 * file. Never throws: every failure mode (missing key, timeout, network,
 * auth, rate limit, provider error, malformed response) is a normal `ok:
 * false` result so callers can fall back gracefully. Never logs the API key
 * or raw provider response bodies.
 */
export async function generateAiCompletion(params: {
  system: string
  user: string
  maxOutputTokens: number
}): Promise<AiCompletionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return { ok: false, reason: 'not_configured' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: params.maxOutputTokens,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
      }),
    })

    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'auth' }
    }

    if (response.status === 429) {
      return { ok: false, reason: 'rate_limited' }
    }

    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: 'provider_error' }
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      return { ok: false, reason: 'malformed_response' }
    }

    const text = extractText(parsed)
    if (text === null) {
      return { ok: false, reason: 'malformed_response' }
    }

    return { ok: true, text }
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timeout)
  }
}
