import type { CrawlPageRow } from '@/lib/crawler/types'
import type { AccessibilityEvidence } from '@/lib/crawler/pillar-extract'

const DEFAULTS: AccessibilityEvidence = {
  imageCount: 0,
  imagesMissingAltCount: 0,
  imagesMissingAltSrcs: [],
  htmlLang: null,
  formInputsMissingLabelCount: 0,
  linksMissingAccessibleNameCount: 0,
  duplicateIdCount: 0,
  iframeMissingTitleCount: 0,
}

/** Typed accessor for `crawl_pages.accessibility_evidence` — see lib/performance/evidence.ts's own doc comment for why every check reads through this rather than casting inline. */
export function readAccessibilityEvidence(page: CrawlPageRow): AccessibilityEvidence {
  const raw = page.accessibility_evidence as Partial<AccessibilityEvidence> | null | undefined
  return { ...DEFAULTS, ...(raw ?? {}) }
}
