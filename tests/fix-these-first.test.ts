import { describe, expect, it } from 'vitest'
import { buildFixTheseFirst } from '@/app/dashboard/websites/[id]/fix-these-first'

describe('buildFixTheseFirst', () => {
  it('sorts across categories by severity, most severe first', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'technical_seo',
        categoryLabel: 'Technical SEO',
        href: '/technical-seo',
        requiresProblemKind: false,
        rows: [{ title: 'Low issue', severity: 'low', affected_page_count: 1, actionability: 'guided_fix' }],
      },
      {
        categoryKey: 'security',
        categoryLabel: 'Security',
        href: '/security',
        requiresProblemKind: true,
        rows: [{ title: 'Critical issue', severity: 'critical', affected_page_count: 1, actionability: 'developer_required', finding_kind: 'problem' }],
      },
    ])

    expect(result[0].title).toBe('Critical issue')
    expect(result[1].title).toBe('Low issue')
  })

  it('breaks severity ties by affected page count, descending', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'technical_seo',
        categoryLabel: 'Technical SEO',
        href: '/technical-seo',
        requiresProblemKind: false,
        rows: [{ title: 'Fewer pages', severity: 'high', affected_page_count: 2, actionability: 'guided_fix' }],
      },
      {
        categoryKey: 'on_page_seo',
        categoryLabel: 'On-Page SEO',
        href: '/on-page-seo',
        requiresProblemKind: false,
        rows: [{ title: 'More pages', severity: 'high', affected_page_count: 9, actionability: 'guided_fix' }],
      },
    ])

    expect(result[0].title).toBe('More pages')
    expect(result[1].title).toBe('Fewer pages')
  })

  it('REAL-WORLD PRODUCT COMPLETION: at the same severity, an actionable finding (safe_fix/prepared_fix/guided_fix/developer_required) outranks a passive "monitor" finding — a monitor item must never dominate an equally-severe actionable one', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'security',
        categoryLabel: 'Security',
        href: '/security',
        requiresProblemKind: true,
        rows: [
          { title: 'Just watch this', severity: 'high', affected_page_count: 50, actionability: 'monitor', finding_kind: 'problem' },
          { title: 'Fix this now', severity: 'high', affected_page_count: 1, actionability: 'safe_fix', finding_kind: 'problem' },
        ],
      },
    ])

    expect(result[0].title).toBe('Fix this now')
    expect(result[1].title).toBe('Just watch this')
  })

  it('still lets a higher-severity monitor finding outrank a lower-severity actionable one — severity is the primary key, actionability only breaks ties', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'security',
        categoryLabel: 'Security',
        href: '/security',
        requiresProblemKind: true,
        rows: [
          { title: 'Critical, monitor only', severity: 'critical', affected_page_count: 1, actionability: 'monitor', finding_kind: 'problem' },
          { title: 'Low, safe fix', severity: 'low', affected_page_count: 1, actionability: 'safe_fix', finding_kind: 'problem' },
        ],
      },
    ])

    expect(result[0].title).toBe('Critical, monitor only')
    expect(result[1].title).toBe('Low, safe fix')
  })

  it('excludes opportunity rows from categories that carry finding_kind, keeping only problems', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'content',
        categoryLabel: 'Content',
        href: '/content',
        requiresProblemKind: true,
        rows: [
          { title: 'An opportunity', severity: 'high', affected_page_count: 5, actionability: 'guided_fix', finding_kind: 'opportunity' },
          { title: 'A real problem', severity: 'high', affected_page_count: 5, actionability: 'guided_fix', finding_kind: 'problem' },
        ],
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('A real problem')
  })

  it('does not filter by finding_kind for categories with no opportunity concept', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'architecture',
        categoryLabel: 'Site Architecture',
        href: '/site-architecture',
        requiresProblemKind: false,
        rows: [{ title: 'Orphan pages', severity: 'medium', affected_page_count: 3, actionability: 'guided_fix' }],
      },
    ])

    expect(result).toHaveLength(1)
  })

  it('caps the result at a small number of items even when many categories have problems', () => {
    const categories = Array.from({ length: 10 }, (_, i) => ({
      categoryKey: `cat-${i}`,
      categoryLabel: `Category ${i}`,
      href: `/cat-${i}`,
      requiresProblemKind: false,
      rows: [{ title: `Problem ${i}`, severity: 'critical' as const, affected_page_count: 1, actionability: 'guided_fix' as const }],
    }))

    const result = buildFixTheseFirst(categories)
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('returns an empty list when no category has any rows', () => {
    const result = buildFixTheseFirst([
      { categoryKey: 'technical_seo', categoryLabel: 'Technical SEO', href: '/technical-seo', requiresProblemKind: false, rows: null },
      { categoryKey: 'content', categoryLabel: 'Content', href: '/content', requiresProblemKind: true, rows: [] },
    ])

    expect(result).toEqual([])
  })

  it('links each item to its own category page', () => {
    const result = buildFixTheseFirst([
      {
        categoryKey: 'accessibility',
        categoryLabel: 'Accessibility',
        href: '/dashboard/websites/abc/accessibility',
        requiresProblemKind: true,
        rows: [{ title: 'Missing alt text', severity: 'medium', affected_page_count: 4, actionability: 'guided_fix', finding_kind: 'problem' }],
      },
    ])

    expect(result[0].href).toBe('/dashboard/websites/abc/accessibility')
    expect(result[0].categoryLabel).toBe('Accessibility')
  })
})
