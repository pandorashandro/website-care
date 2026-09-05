import { describe, it, expect } from 'vitest'
import { extractCandidateSlug, normalizePath } from '@/lib/integrations/wix/resource-mapping'

/**
 * Wix V1 Prompt 1 — permanent regression coverage for the pure URL-parsing
 * logic resolveWixResource depends on. Deliberately does NOT test
 * resolveWixResource itself, which requires a live fetchWixApi call — see
 * this module's own doc comment on why a test that mocks the network call
 * away would prove nothing about the real resolution logic beyond what
 * these two pure helpers already cover deterministically.
 */
describe('extractCandidateSlug', () => {
  it('extracts the last path segment as the candidate slug', () => {
    expect(extractCandidateSlug('https://example.wixsite.com/mysite/post/my-post-slug')).toBe('my-post-slug')
    expect(extractCandidateSlug('https://example.com/product-page/my-product')).toBe('my-product')
  })

  it('returns null for the homepage (no path segments)', () => {
    expect(extractCandidateSlug('https://example.com/')).toBeNull()
    expect(extractCandidateSlug('https://example.com')).toBeNull()
  })

  it('returns null for a malformed URL rather than throwing', () => {
    expect(() => extractCandidateSlug('not a url')).not.toThrow()
    expect(extractCandidateSlug('not a url')).toBeNull()
  })

  it('ignores a trailing slash', () => {
    expect(extractCandidateSlug('https://example.com/post/my-slug/')).toBe('my-slug')
  })
})

describe('normalizePath', () => {
  it('strips leading and trailing slashes so equivalent paths compare equal', () => {
    expect(normalizePath('/post/my-slug')).toBe(normalizePath('post/my-slug/'))
    expect(normalizePath('/post/my-slug/')).toBe('post/my-slug')
  })

  it('does not affect internal slashes', () => {
    expect(normalizePath('/a/b/c/')).toBe('a/b/c')
  })

  it('treats an empty/root path consistently', () => {
    expect(normalizePath('/')).toBe('')
    expect(normalizePath('')).toBe('')
  })
})
