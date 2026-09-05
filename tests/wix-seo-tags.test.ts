import { describe, it, expect } from 'vitest'
import {
  extractResolvedTitle,
  extractResolvedMetaDescription,
  replaceTagOfType,
  isTitleTag,
  isMetaDescriptionTag,
  type WixSeoTag,
  type WixResolvedSeoTag,
} from '@/lib/integrations/wix/seo-tags'

/**
 * Wix V1 Prompt 2 — permanent regression coverage for the pure SEO-tag
 * extraction and merge logic every Prepare/Apply/Undo flow depends on.
 * Covers item N (unrelated SEO tags preserved) directly: replaceTagOfType
 * is the ENTIRE mechanism behind "preserve unrelated tags" (required by
 * Set Item SEO Tags' full-array-replacement semantics — see
 * lib/integrations/wix/seo-tags.ts's module doc comment).
 */

const titleTag: WixSeoTag = { type: 'title', children: 'Old Title' }
const metaTag: WixSeoTag = { type: 'meta', props: { name: 'description', content: 'Old description' } }
const ogTitleTag: WixSeoTag = { type: 'meta', props: { name: 'og:title', content: 'Social title' } }
const canonicalTag: WixSeoTag = { type: 'link', props: { rel: 'canonical', href: 'https://example.com/x' } }

describe('replaceTagOfType — unrelated tag preservation', () => {
  it('replaces only the matching tag, preserving every other tag exactly', () => {
    const ownTags = [titleTag, metaTag, ogTitleTag, canonicalTag]
    const newTitleTag: WixSeoTag = { type: 'title', children: 'New Title' }

    const result = replaceTagOfType(ownTags, isTitleTag, newTitleTag)

    expect(result).toContainEqual(newTitleTag)
    expect(result).not.toContainEqual(titleTag)
    // Every unrelated tag survives byte-for-byte.
    expect(result).toContainEqual(metaTag)
    expect(result).toContainEqual(ogTitleTag)
    expect(result).toContainEqual(canonicalTag)
    expect(result).toHaveLength(4)
  })

  it('replacing meta description preserves the title, og:title, and canonical tags', () => {
    const ownTags = [titleTag, metaTag, ogTitleTag, canonicalTag]
    const newMetaTag: WixSeoTag = { type: 'meta', props: { name: 'description', content: 'New description' } }

    const result = replaceTagOfType(ownTags, isMetaDescriptionTag, newMetaTag)

    expect(result).toContainEqual(newMetaTag)
    expect(result).not.toContainEqual(metaTag)
    expect(result).toContainEqual(titleTag)
    expect(result).toContainEqual(ogTitleTag)
    expect(result).toContainEqual(canonicalTag)
    expect(result).toHaveLength(4)
  })

  it('adds the new tag even when the item had no tag of that type before (nothing to preserve is lost)', () => {
    const ownTags = [metaTag] // no title tag yet
    const newTitleTag: WixSeoTag = { type: 'title', children: 'Brand New Title' }

    const result = replaceTagOfType(ownTags, isTitleTag, newTitleTag)

    expect(result).toContainEqual(newTitleTag)
    expect(result).toContainEqual(metaTag)
    expect(result).toHaveLength(2)
  })

  it('does not confuse og:title (a meta tag) with the title tag type', () => {
    expect(isTitleTag(ogTitleTag)).toBe(false)
    expect(isMetaDescriptionTag(ogTitleTag)).toBe(false)
  })

  it('does not confuse an og:description meta tag with the meta-description tag', () => {
    const ogDescription: WixSeoTag = { type: 'meta', props: { name: 'og:description', content: 'social copy' } }
    expect(isMetaDescriptionTag(ogDescription)).toBe(false)
  })
})

describe('extractResolvedTitle / extractResolvedMetaDescription', () => {
  it('extracts the resolved title from the resolvedTags array', () => {
    const resolvedTags: WixResolvedSeoTag[] = [
      { tag: { type: 'title', children: 'Home | Ceramics studio' }, source: 'TAG_SOURCE_DEFAULT_PATTERN' },
      { tag: { type: 'link', props: { rel: 'canonical', href: 'https://example.com' } }, source: 'TAG_SOURCE_DEFAULT_PATTERN' },
    ]
    expect(extractResolvedTitle(resolvedTags)).toBe('Home | Ceramics studio')
  })

  it('extracts the resolved meta description, ignoring an og:description entry', () => {
    const resolvedTags: WixResolvedSeoTag[] = [
      { tag: { type: 'meta', props: { name: 'og:description', content: 'wrong one' } }, source: 'TAG_SOURCE_ITEM' },
      { tag: { type: 'meta', props: { name: 'description', content: 'The real description' } }, source: 'TAG_SOURCE_ITEM' },
    ]
    expect(extractResolvedMetaDescription(resolvedTags)).toBe('The real description')
  })

  it('returns null when no matching tag exists', () => {
    expect(extractResolvedTitle([])).toBeNull()
    expect(extractResolvedMetaDescription([])).toBeNull()
  })
})
