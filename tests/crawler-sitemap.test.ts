import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scanner/checks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scanner/checks')>()
  return { ...actual, fetchPage: vi.fn() }
})

import { fetchPage } from '@/lib/scanner/checks'
import { discoverSitemapUrls } from '@/lib/crawler/sitemap'

function htmlResult(html: string, status = 200) {
  return {
    ok: true as const,
    html,
    durationMs: 10,
    sizeBytes: html.length,
    finalUrl: 'https://example.com/sitemap.xml',
    finalStatus: status,
    redirectChain: [],
    redirectCount: 0,
    xRobotsTag: null,
    contentType: 'application/xml',
  }
}

const URLSET = `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`

describe('discoverSitemapUrls', () => {
  beforeEach(() => {
    vi.mocked(fetchPage).mockReset()
  })

  it('discovers URLs from a plain urlset sitemap', async () => {
    vi.mocked(fetchPage).mockResolvedValue(htmlResult(URLSET))

    const result = await discoverSitemapUrls('https://example.com', [])

    expect(result.urls.sort()).toEqual(['https://example.com/a', 'https://example.com/b'])
    expect(result.truncated).toBe(false)
    expect(result.reachable).toBe(true)
  })

  it('recurses into a sitemap index one level', async () => {
    const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url.includes('sitemap-1')) return htmlResult(URLSET)
      return htmlResult(index)
    })

    const result = await discoverSitemapUrls('https://example.com', [])

    expect(result.urls.sort()).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('deduplicates URLs seen across multiple sitemap files', async () => {
    const indexTwoChildren = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap><sitemap><loc>https://example.com/s2.xml</loc></sitemap></sitemapindex>`
    vi.mocked(fetchPage).mockResolvedValue(htmlResult(URLSET))
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      if (url.includes('s1.xml') || url.includes('s2.xml')) return htmlResult(URLSET)
      return htmlResult(indexTwoChildren)
    })

    const result = await discoverSitemapUrls('https://example.com', [])
    expect(result.urls.sort()).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('ignores off-site URLs declared in a sitemap', async () => {
    const withExternal = `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://evil.example.net/x</loc></url></urlset>`
    vi.mocked(fetchPage).mockResolvedValue(htmlResult(withExternal))

    const result = await discoverSitemapUrls('https://example.com', [])
    expect(result.urls).toEqual(['https://example.com/a'])
  })

  it('stops and reports truncated when index recursion exceeds the depth limit', async () => {
    // Chain of indexes deeper than MAX_SITEMAP_INDEX_DEPTH (2): 0 -> 1 -> 2 -> 3
    vi.mocked(fetchPage).mockImplementation(async (url: string) => {
      const match = url.match(/level-(\d+)/)
      const level = match ? Number(match[1]) : 0
      return htmlResult(`<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/level-${level + 1}.xml</loc></sitemap></sitemapindex>`)
    })

    const result = await discoverSitemapUrls('https://example.com', ['https://example.com/level-0.xml'])
    expect(result.truncated).toBe(true)
    expect(result.urls).toEqual([])
  })

  it('returns no URLs (not an error) when every candidate is unreachable, and reports reachable: false (Phase 26)', async () => {
    vi.mocked(fetchPage).mockResolvedValue({ ok: false, reason: 'network' } as never)

    const result = await discoverSitemapUrls('https://example.com', [])
    expect(result.urls).toEqual([])
    expect(result.reachable).toBe(false)
  })

  it('reports reachable: true when a sitemap file responds but contains no usable URLs (Phase 26)', async () => {
    vi.mocked(fetchPage).mockResolvedValue(htmlResult('<?xml version="1.0"?><urlset></urlset>'))

    const result = await discoverSitemapUrls('https://example.com', [])
    expect(result.urls).toEqual([])
    expect(result.reachable).toBe(true)
  })

  it('caps the number of sitemap files fetched (pathological expansion protection)', async () => {
    let calls = 0
    vi.mocked(fetchPage).mockImplementation(async () => {
      calls++
      return htmlResult(`<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/s${calls}.xml</loc></sitemap></sitemapindex>`)
    })

    const result = await discoverSitemapUrls('https://example.com', [])
    expect(result.truncated).toBe(true)
    expect(calls).toBeLessThanOrEqual(10) // MAX_SITEMAP_FILES
  })
})
