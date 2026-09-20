import { describe, expect, it } from 'vitest'
import { analyzeMissingImageAlt } from '@/lib/accessibility/checks/missing-image-alt'
import { analyzeMissingHtmlLang } from '@/lib/accessibility/checks/missing-html-lang'
import { analyzeFormInputsMissingLabel } from '@/lib/accessibility/checks/form-inputs-missing-label'
import { analyzeLinksMissingAccessibleName } from '@/lib/accessibility/checks/links-missing-accessible-name'
import { analyzeDuplicateIds } from '@/lib/accessibility/checks/duplicate-ids'
import { analyzeIframeMissingTitle } from '@/lib/accessibility/checks/iframe-missing-title'
import { analyzeManualTestingNotice } from '@/lib/accessibility/checks/manual-testing-notice'
import { pillarContextFor } from './helpers/pillar-fixtures'
import { makePage } from './helpers/architecture-fixtures'

describe('Accessibility checks', () => {
  it('flags images missing alt text', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { imagesMissingAltCount: 3 } })
    const finding = analyzeMissingImageAlt(pillarContextFor([page]))[0]
    expect(finding.kind).toBe('problem')
    expect(finding.checkKey).toBe('images_missing_alt')
  })

  it('SAFE FIX CONNECTION: emits one instance PER missing-alt image, keyed by affectedResourceUrl = the image src, enabling a specific image to be safely targeted', () => {
    const page = makePage({
      url: 'https://example.com/a',
      accessibility_evidence: { imagesMissingAltCount: 2, imagesMissingAltSrcs: ['https://example.com/hero.jpg', 'https://example.com/logo.png'] },
    })
    const finding = analyzeMissingImageAlt(pillarContextFor([page]))[0]
    expect(finding.affectedPages).toHaveLength(2)
    expect(finding.affectedPages.map((p) => p.affectedResourceUrl).sort()).toEqual(['https://example.com/hero.jpg', 'https://example.com/logo.png'].sort())
  })

  it('falls back to one page-level instance (no affectedResourceUrl) when the count is non-zero but no srcs were captured (stale evidence)', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { imagesMissingAltCount: 3, imagesMissingAltSrcs: [] } })
    const finding = analyzeMissingImageAlt(pillarContextFor([page]))[0]
    expect(finding.affectedPages).toHaveLength(1)
    expect(finding.affectedPages[0].affectedResourceUrl).toBeNull()
  })

  it('does not flag a page with zero missing-alt images', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { imagesMissingAltCount: 0 } })
    expect(analyzeMissingImageAlt(pillarContextFor([page]))).toEqual([])
  })

  it('flags a page with no html lang attribute', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { htmlLang: null } })
    expect(analyzeMissingHtmlLang(pillarContextFor([page]))).toHaveLength(1)
  })

  it('does not flag a page that declares a lang', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { htmlLang: 'en' } })
    expect(analyzeMissingHtmlLang(pillarContextFor([page]))).toEqual([])
  })

  it('flags unlabeled form fields at HIGH severity — a real usability blocker', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { formInputsMissingLabelCount: 2 } })
    const finding = analyzeFormInputsMissingLabel(pillarContextFor([page]))[0]
    expect(finding.baseSeverity).toBe('high')
  })

  it('flags links with no accessible name', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { linksMissingAccessibleNameCount: 1 } })
    expect(analyzeLinksMissingAccessibleName(pillarContextFor([page]))).toHaveLength(1)
  })

  it('flags duplicate ids', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { duplicateIdCount: 2 } })
    expect(analyzeDuplicateIds(pillarContextFor([page]))).toHaveLength(1)
  })

  it('flags iframes missing a title', () => {
    const page = makePage({ url: 'https://example.com/a', accessibility_evidence: { iframeMissingTitleCount: 1 } })
    expect(analyzeIframeMissingTitle(pillarContextFor([page]))).toHaveLength(1)
  })

  it('the manual-testing notice is always emitted and never implies full WCAG compliance', () => {
    const page = makePage({ url: 'https://example.com/a' })
    const finding = analyzeManualTestingNotice(pillarContextFor([page]))[0]
    expect(finding.kind).toBe('opportunity')
    expect(finding.explanation.toLowerCase()).not.toContain('wcag compliant')
    expect(finding.explanation.toLowerCase()).toContain('keyboard')
  })

  it('emits nothing from the manual-testing notice when there are zero eligible pages', () => {
    expect(analyzeManualTestingNotice(pillarContextFor([]))).toEqual([])
  })
})
