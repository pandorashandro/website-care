import { describe, expect, it } from 'vitest'
import {
  classifyIssueForFixPreview,
  getTitleIssueKind,
  getMetaDescriptionIssueKind,
  getH1IssueKind,
} from '@/lib/fixes/fix-preview'
import { ISSUE_DEFINITIONS } from '@/lib/scanner/issue-definitions'

/**
 * PAYABLE-V1 PRODUCT COMPLETION — regression coverage for the bridge that
 * connects the CANONICAL On-Page SEO engine's own title strings
 * (lib/on-page/checks/title.ts, meta-description.ts, headings.ts) to the
 * WordPress Prepare/Apply Fix classifier, which previously only recognized
 * the legacy single-page-scan issue titles (lib/scanner/issue-definitions.ts).
 * Before this fix, `PrepareFixButton` was wired into the canonical On-Page
 * SEO report page but every click resolved to 'unsupported', since the
 * canonical engine's own customer-facing copy never matched this
 * classifier at all — a real "action that implies a capability that does
 * not exist" bug this test locks in against regressing.
 */
describe('classifyIssueForFixPreview recognizes both legacy and canonical title strings', () => {
  it('legacy scanner title strings still classify correctly (unchanged behavior)', () => {
    expect(classifyIssueForFixPreview(ISSUE_DEFINITIONS.missing_title.title)).toBe('title')
    expect(classifyIssueForFixPreview(ISSUE_DEFINITIONS.title_too_short.title)).toBe('title')
    expect(classifyIssueForFixPreview(ISSUE_DEFINITIONS.title_too_long.title)).toBe('title')
    expect(classifyIssueForFixPreview(ISSUE_DEFINITIONS.missing_meta_description.title)).toBe('meta_description')
    expect(classifyIssueForFixPreview(ISSUE_DEFINITIONS.missing_h1.title)).toBe('h1')
    expect(classifyIssueForFixPreview(ISSUE_DEFINITIONS.multiple_h1.title)).toBe('h1')
  })

  it('the canonical On-Page SEO engine\'s own title strings now classify identically to their legacy equivalents', () => {
    expect(classifyIssueForFixPreview('Pages have no title tag')).toBe('title')
    expect(classifyIssueForFixPreview('Page titles are too short')).toBe('title')
    expect(classifyIssueForFixPreview('Page titles are too long')).toBe('title')
    expect(classifyIssueForFixPreview('Pages have no meta description')).toBe('meta_description')
    expect(classifyIssueForFixPreview('Meta descriptions are too short')).toBe('meta_description')
    expect(classifyIssueForFixPreview('Meta descriptions are too long')).toBe('meta_description')
    expect(classifyIssueForFixPreview('Pages have no H1 heading')).toBe('h1')
    expect(classifyIssueForFixPreview('Pages have multiple H1 headings')).toBe('h1')
  })

  it('canonical and legacy title strings resolve to the exact same fix kind, so the deterministic generator behaves identically regardless of which surface triggered it', () => {
    expect(getTitleIssueKind('Pages have no title tag')).toBe(getTitleIssueKind(ISSUE_DEFINITIONS.missing_title.title))
    expect(getTitleIssueKind('Page titles are too short')).toBe(getTitleIssueKind(ISSUE_DEFINITIONS.title_too_short.title))
    expect(getMetaDescriptionIssueKind('Pages have no meta description')).toBe(
      getMetaDescriptionIssueKind(ISSUE_DEFINITIONS.missing_meta_description.title)
    )
    expect(getH1IssueKind('Pages have no H1 heading')).toBe(getH1IssueKind(ISSUE_DEFINITIONS.missing_h1.title))
  })

  it('canonical on-page findings with no real automated fix (weak_title, duplicate_title, duplicate_meta_description, multiple_h1\'s own guided-only handling) are unaffected — this bridge never invents new fixable kinds', () => {
    expect(classifyIssueForFixPreview('Pages use a generic, placeholder-style title')).toBe('unsupported')
    expect(classifyIssueForFixPreview('Multiple pages share the same title')).toBe('unsupported')
    expect(classifyIssueForFixPreview('Multiple pages share the same meta description')).toBe('unsupported')
  })

  it('an arbitrary, unrecognized title string is still unsupported', () => {
    expect(classifyIssueForFixPreview('Some made-up finding title')).toBe('unsupported')
  })
})
