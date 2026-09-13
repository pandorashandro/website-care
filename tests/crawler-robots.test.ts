import { describe, expect, it } from 'vitest'
import { parseRobotsRules, isPathAllowed } from '@/lib/crawler/robots'

describe('parseRobotsRules + isPathAllowed', () => {
  it('allows everything when there are no groups at all', () => {
    const rules = parseRobotsRules('')
    expect(isPathAllowed(rules, '/anything')).toBe(true)
  })

  it('allows everything when the matching group has no rules', () => {
    const rules = parseRobotsRules('User-agent: *\n')
    expect(isPathAllowed(rules, '/anything')).toBe(true)
  })

  it('applies a wildcard Disallow rule to unmatched paths', () => {
    const rules = parseRobotsRules('User-agent: *\nDisallow: /admin\n')
    expect(isPathAllowed(rules, '/admin')).toBe(false)
    expect(isPathAllowed(rules, '/admin/settings')).toBe(false)
    expect(isPathAllowed(rules, '/products')).toBe(true)
  })

  it('an empty Disallow value means allow everything', () => {
    const rules = parseRobotsRules('User-agent: *\nDisallow:\n')
    expect(isPathAllowed(rules, '/anything')).toBe(true)
  })

  it('prefers webioom\'s own crawler group over the wildcard group when both exist', () => {
    const rules = parseRobotsRules(['User-agent: *', 'Disallow: /', '', 'User-agent: WebsiteCareBot', 'Disallow:'].join('\n'))
    expect(isPathAllowed(rules, '/products')).toBe(true)
  })

  it('a more specific disallow still applies to webioom\'s own group', () => {
    const rules = parseRobotsRules(['User-agent: WebsiteCareBot', 'Disallow: /private'].join('\n'))
    expect(isPathAllowed(rules, '/private/data')).toBe(false)
    expect(isPathAllowed(rules, '/public')).toBe(true)
  })

  it('longest matching rule wins regardless of Allow/Disallow order', () => {
    const rules = parseRobotsRules(['User-agent: *', 'Disallow: /articles', 'Allow: /articles/public'].join('\n'))
    expect(isPathAllowed(rules, '/articles/private')).toBe(false)
    expect(isPathAllowed(rules, '/articles/public/post')).toBe(true)
  })

  it('supports wildcard (*) within a rule pattern', () => {
    const rules = parseRobotsRules(['User-agent: *', 'Disallow: /*.pdf'].join('\n'))
    expect(isPathAllowed(rules, '/files/report.pdf')).toBe(false)
    expect(isPathAllowed(rules, '/files/report.html')).toBe(true)
  })

  it('supports end-of-path anchoring ($)', () => {
    const rules = parseRobotsRules(['User-agent: *', 'Disallow: /page$'].join('\n'))
    expect(isPathAllowed(rules, '/page')).toBe(false)
    expect(isPathAllowed(rules, '/page/extra')).toBe(true)
  })

  it('consecutive User-agent lines share one rule set', () => {
    const rules = parseRobotsRules(['User-agent: WebsiteCareBot', 'User-agent: OtherBot', 'Disallow: /shared'].join('\n'))
    expect(isPathAllowed(rules, '/shared')).toBe(false)
  })

  it('extracts declared Sitemap directives', () => {
    const rules = parseRobotsRules(['User-agent: *', 'Disallow:', 'Sitemap: https://example.com/sitemap.xml'].join('\n'))
    expect(rules.sitemapUrls).toEqual(['https://example.com/sitemap.xml'])
  })

  it('ignores comments', () => {
    const rules = parseRobotsRules(['# a comment', 'User-agent: *', '# another comment', 'Disallow: /admin'].join('\n'))
    expect(isPathAllowed(rules, '/admin')).toBe(false)
  })

  it('falls back to allow-everything when no group matches at all (no wildcard, no webioom-specific group)', () => {
    const rules = parseRobotsRules(['User-agent: Googlebot', 'Disallow: /'].join('\n'))
    expect(isPathAllowed(rules, '/anything')).toBe(true)
  })
})
