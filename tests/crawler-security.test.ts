import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 25B, Checkpoint 8 — security regression suite for the shared fetch
 * primitive (lib/scanner/checks.ts's fetchPage) that BOTH the crawler and
 * every existing verifier/scanner depend on. Unlike tests/crawler-ssrf.test.ts
 * (which exercises the pure IP-classification helpers directly), this file
 * exercises the real, unmocked `fetchPage` end to end — only Node's global
 * `fetch` and `node:dns/promises`'s `lookup` are stubbed, so every branch
 * inside fetchPage itself (scheme check, credential check, per-hop hostname
 * guard, redirect-loop/too-many-redirects detection, response-size cap) runs
 * for real. No real network call is ever made.
 */

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { lookup as dnsLookup } from 'node:dns/promises'
import { fetchPage } from '@/lib/scanner/checks'

function jsonHeaders(entries: Record<string, string>) {
  return new Headers(entries)
}

beforeEach(() => {
  vi.mocked(dnsLookup).mockReset()
  // Default: any hostname not specifically stubbed resolves to an ordinary
  // public address — tests that care about a SPECIFIC blocked resolution
  // override this per-hostname below.
  vi.mocked(dnsLookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPage — scheme and credential rejection (Checkpoint 8)', () => {
  it('rejects non-http(s) schemes without ever calling fetch', async () => {
    const result = await fetchPage('javascript:alert(1)')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a data: URL without ever calling fetch', async () => {
    const result = await fetchPage('data:text/html,<script>alert(1)</script>')
    expect(result.ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a credential-bearing URL (userinfo) without ever calling fetch', async () => {
    const result = await fetchPage('https://user:pass@example.com/')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('fetchPage — DNS-resolution-based SSRF blocking (Checkpoint 8)', () => {
  it('blocks a hostname that resolves to a private address without ever calling fetch', async () => {
    vi.mocked(dnsLookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never)

    const result = await fetchPage('https://internal.example.com/')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks a hostname that resolves to the cloud metadata address', async () => {
    vi.mocked(dnsLookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never)

    const result = await fetchPage('https://looks-legit.example.com/')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('fetchPage — unsafe redirect destinations (Checkpoint 8)', () => {
  it('rejects a redirect to a private-IP-literal destination instead of following it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: jsonHeaders({ location: 'http://127.0.0.1/admin' }) })
    )

    const result = await fetchPage('https://example.com/redirector')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
    // Only the first hop is ever actually requested — the blocked target
    // itself must never be fetched.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a same-host redirect to a hostname that resolves internally', async () => {
    vi.mocked(dnsLookup).mockImplementation(async (hostname: string) => {
      if (hostname === 'internal.example.com') return [{ address: '10.1.2.3', family: 4 }] as never
      return [{ address: '93.184.216.34', family: 4 }] as never
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: jsonHeaders({ location: 'https://internal.example.com/' }) })
    )

    const result = await fetchPage('https://example.com/redirector')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('detects a redirect loop rather than following it forever', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const target = url.endsWith('/a') ? 'https://example.com/b' : 'https://example.com/a'
      return new Response(null, { status: 302, headers: jsonHeaders({ location: target }) })
    })

    const result = await fetchPage('https://example.com/a')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('redirect_loop')
  })

  it('gives up with too_many_redirects rather than following an unbounded chain of distinct URLs', async () => {
    let hop = 0
    vi.mocked(fetch).mockImplementation(async () => {
      hop++
      return new Response(null, { status: 302, headers: jsonHeaders({ location: `https://example.com/hop-${hop}` }) })
    })

    const result = await fetchPage('https://example.com/start')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_many_redirects')
    // Bounded, not unbounded — a hard ceiling on hops regardless of how many
    // distinct URLs an attacker-controlled redirect chain offers.
    expect(vi.mocked(fetch).mock.calls.length).toBeLessThan(10)
  })
})

describe('fetchPage — response-size cap (Checkpoint 8)', () => {
  it('rejects a response whose decompressed body exceeds the size cap instead of buffering it fully', async () => {
    const CHUNK = new Uint8Array(1024 * 1024) // 1 MiB per chunk
    const CHUNKS_OVER_CAP = 16 // 16 MiB > the 15 MiB cap

    // Yields CHUNKS_OVER_CAP chunks then closes — a well-behaved (finite)
    // stream that is still bigger than the cap, so the test terminates
    // whether or not the cap is actually enforced (a regression would show
    // up as `result.ok === true`, not as a hang).
    let enqueuedChunks = 0
    const cappedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (enqueuedChunks >= CHUNKS_OVER_CAP) {
          controller.close()
          return
        }
        enqueuedChunks++
        controller.enqueue(CHUNK)
      },
    })

    vi.mocked(fetch).mockResolvedValueOnce(new Response(cappedStream, { status: 200 }))

    const result = await fetchPage('https://example.com/huge-page')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('blocked')
  })

  it('accepts a response comfortably under the size cap', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<title>Small page</title>', { status: 200 }))

    const result = await fetchPage('https://example.com/small-page')
    expect(result.ok).toBe(true)
  })
})
