import type { CrawlPageRow } from '@/lib/crawler/types'
import type { SecurityEvidence } from '@/lib/crawler/pillar-extract'

const DEFAULTS: SecurityEvidence = {
  isHttps: false,
  mixedContentCount: 0,
  mixedContentUrls: [],
  insecureFormCount: 0,
  headers: {
    strictTransportSecurity: null,
    contentSecurityPolicy: null,
    xContentTypeOptions: null,
    referrerPolicy: null,
    xFrameOptions: null,
    permissionsPolicy: null,
  },
}

/** Typed accessor for `crawl_pages.security_evidence` — see lib/performance/evidence.ts's own doc comment for why every check reads through this rather than casting inline. */
export function readSecurityEvidence(page: CrawlPageRow): SecurityEvidence {
  const raw = page.security_evidence as Partial<SecurityEvidence> | null | undefined
  return { ...DEFAULTS, ...(raw ?? {}), headers: { ...DEFAULTS.headers, ...(raw?.headers ?? {}) } }
}
