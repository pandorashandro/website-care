import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createResendEmailProvider } from '@/lib/monitoring/email/resend-provider'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('createResendEmailProvider', () => {
  it('sends the message with the configured API key and from address, and returns the provider message id on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { id: 'msg_abc123' }))

    const provider = createResendEmailProvider('rk_test_key', 'webioom <alerts@webioom.com>')
    const result = await provider.send({ to: 'owner@example.com', subject: 'Subject', text: 'Body' })

    expect(result).toEqual({ ok: true, providerMessageId: 'msg_abc123' })

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer rk_test_key')

    const sentBody = JSON.parse(init?.body as string)
    expect(sentBody).toEqual({ from: 'webioom <alerts@webioom.com>', to: ['owner@example.com'], subject: 'Subject', text: 'Body' })
  })

  it('NO SECRET LEAKAGE: the API key never appears anywhere in a returned success or failure result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(422, { message: 'Invalid `to` field' }))

    const provider = createResendEmailProvider('rk_super_secret_key', 'alerts@webioom.com')
    const result = await provider.send({ to: 'not-an-email', subject: 'Subject', text: 'Body' })

    expect(JSON.stringify(result)).not.toContain('rk_super_secret_key')
  })

  it('returns a descriptive, safe failure for a non-ok provider response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(422, { message: 'Invalid `to` field' }))

    const provider = createResendEmailProvider('rk_test_key', 'alerts@webioom.com')
    const result = await provider.send({ to: 'not-an-email', subject: 'Subject', text: 'Body' })

    expect(result).toEqual({ ok: false, error: 'Resend rejected the request (422): Invalid `to` field' })
  })

  it('returns a safe failure when the provider response body is not valid JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('not json') } } as unknown as Response)

    const provider = createResendEmailProvider('rk_test_key', 'alerts@webioom.com')
    const result = await provider.send({ to: 'owner@example.com', subject: 'Subject', text: 'Body' })

    expect(result).toEqual({ ok: false, error: 'Resend request failed with status 500.' })
  })

  it('returns a timeout-specific failure when the request aborts', async () => {
    const timeoutError = new DOMException('The operation was aborted.', 'TimeoutError')
    vi.mocked(fetch).mockRejectedValueOnce(timeoutError)

    const provider = createResendEmailProvider('rk_test_key', 'alerts@webioom.com')
    const result = await provider.send({ to: 'owner@example.com', subject: 'Subject', text: 'Body' })

    expect(result).toEqual({ ok: false, error: 'Email provider request timed out.' })
  })

  it('returns a generic network failure for any other thrown error, without leaking its raw message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.resend.com'))

    const provider = createResendEmailProvider('rk_test_key', 'alerts@webioom.com')
    const result = await provider.send({ to: 'owner@example.com', subject: 'Subject', text: 'Body' })

    expect(result).toEqual({ ok: false, error: 'Email provider request could not be sent.' })
  })
})
