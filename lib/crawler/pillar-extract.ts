import {
  getHtmlLangAttribute,
  getImgTags,
  getImageSrcsMissingAlt,
  countImagesMissingAlt,
  countImagesMissingDimensions,
  countImagesMissingLazyLoading,
  countExternalScripts,
  countRenderBlockingHeadScripts,
  countStylesheets,
  countFormInputsMissingLabel,
  countLinksMissingAccessibleName,
  countDuplicateIds,
  countIframesMissingTitle,
  countMixedContentReferences,
  getMixedContentUrls,
  countInsecureForms,
  isHttps,
} from '@/lib/scanner/checks'

/**
 * Unified webioom engine, Prompt 2 — the SMALLEST responsible crawler
 * evidence expansion the three new canonical engines (Performance,
 * Accessibility, Security) need, mirroring lib/crawler/content-extract.ts's
 * own precedent exactly: reuse the SAME already-fetched HTML every other
 * extractor processes (no second fetch, no headless browser), compute a
 * compact, structured, JSON-serializable evidence object once at crawl
 * time, and persist ONLY that — never raw HTML (see content-extract.ts's
 * own doc comment for why: storage cost, and no check here needs it after
 * this pass).
 *
 * Each field is a narrow, literal FACT about the page's markup/response —
 * never an interpreted verdict. Interpretation (what counts as a problem,
 * at what severity) belongs entirely to each engine's own checks
 * (lib/performance/checks/*, lib/accessibility/checks/*,
 * lib/security/checks/*), which is why these three functions never return
 * a severity, a title, or a recommendation — only counts and raw values.
 */

export type PerformanceEvidence = {
  scriptCount: number
  renderBlockingScriptCount: number
  stylesheetCount: number
  imagesMissingDimensionsCount: number
  imagesMissingLazyLoadingCount: number
  responseContentEncoding: string | null
  responseCacheControl: string | null
}

export type AccessibilityEvidence = {
  imageCount: number
  imagesMissingAltCount: number
  /** Unified webioom Prompt 3 — the exact `src` of each missing-alt image (bounded, see getImageSrcsMissingAlt), enabling a specific image-alt fix to be safely targeted rather than only counted. `imagesMissingAltCount` may exceed this array's length on a page with more than the per-page cap; the array is never treated as exhaustive. */
  imagesMissingAltSrcs: string[]
  htmlLang: string | null
  formInputsMissingLabelCount: number
  linksMissingAccessibleNameCount: number
  duplicateIdCount: number
  iframeMissingTitleCount: number
}

export type SecurityHeaderEvidence = {
  strictTransportSecurity: string | null
  contentSecurityPolicy: string | null
  xContentTypeOptions: string | null
  referrerPolicy: string | null
  xFrameOptions: string | null
  permissionsPolicy: string | null
}

export type SecurityEvidence = {
  isHttps: boolean
  mixedContentCount: number
  /** PAYABLE-V1 remediation-depth pass — the exact insecure `http://` URL of each mixed-content reference (bounded, see getMixedContentUrls). `mixedContentCount` may exceed this array's length; never treated as exhaustive. */
  mixedContentUrls: string[]
  insecureFormCount: number
  headers: SecurityHeaderEvidence
}

const EMPTY_PERFORMANCE_EVIDENCE: PerformanceEvidence = {
  scriptCount: 0,
  renderBlockingScriptCount: 0,
  stylesheetCount: 0,
  imagesMissingDimensionsCount: 0,
  imagesMissingLazyLoadingCount: 0,
  responseContentEncoding: null,
  responseCacheControl: null,
}

const EMPTY_ACCESSIBILITY_EVIDENCE: AccessibilityEvidence = {
  imageCount: 0,
  imagesMissingAltCount: 0,
  imagesMissingAltSrcs: [],
  htmlLang: null,
  formInputsMissingLabelCount: 0,
  linksMissingAccessibleNameCount: 0,
  duplicateIdCount: 0,
  iframeMissingTitleCount: 0,
}

/** For a non-HTML resource (or a failed fetch), there is nothing to evaluate — never a fabricated 0-defect "clean" result; callers must treat an empty-evidence page as ineligible (see each engine's own eligibility rule), not as evidence of good performance/accessibility. */
export function emptyPerformanceEvidence(): PerformanceEvidence {
  return EMPTY_PERFORMANCE_EVIDENCE
}
export function emptyAccessibilityEvidence(): AccessibilityEvidence {
  return EMPTY_ACCESSIBILITY_EVIDENCE
}

export function extractPerformanceEvidence(html: string, responseHeaders: { contentEncoding: string | null; cacheControl: string | null }): PerformanceEvidence {
  return {
    scriptCount: countExternalScripts(html),
    renderBlockingScriptCount: countRenderBlockingHeadScripts(html),
    stylesheetCount: countStylesheets(html),
    imagesMissingDimensionsCount: countImagesMissingDimensions(html),
    imagesMissingLazyLoadingCount: countImagesMissingLazyLoading(html),
    responseContentEncoding: responseHeaders.contentEncoding,
    responseCacheControl: responseHeaders.cacheControl,
  }
}

export function extractAccessibilityEvidence(html: string): AccessibilityEvidence {
  return {
    imageCount: getImgTags(html).length,
    // The FULL count (never capped) — imagesMissingAltSrcs below IS capped
    // for storage, so these two can legitimately diverge on a page with
    // more than MAX_MISSING_ALT_SRCS_PER_PAGE missing-alt images.
    imagesMissingAltCount: countImagesMissingAlt(html),
    imagesMissingAltSrcs: getImageSrcsMissingAlt(html),
    htmlLang: getHtmlLangAttribute(html),
    formInputsMissingLabelCount: countFormInputsMissingLabel(html),
    linksMissingAccessibleNameCount: countLinksMissingAccessibleName(html),
    duplicateIdCount: countDuplicateIds(html),
    iframeMissingTitleCount: countIframesMissingTitle(html),
  }
}

export function extractSecurityEvidence(
  html: string,
  finalUrl: string,
  responseHeaders: {
    strictTransportSecurity: string | null
    contentSecurityPolicy: string | null
    xContentTypeOptions: string | null
    referrerPolicy: string | null
    xFrameOptions: string | null
    permissionsPolicy: string | null
  }
): SecurityEvidence {
  const pageIsHttps = isHttps(finalUrl)
  return {
    isHttps: pageIsHttps,
    mixedContentCount: countMixedContentReferences(html, pageIsHttps),
    mixedContentUrls: getMixedContentUrls(html, pageIsHttps),
    insecureFormCount: countInsecureForms(html),
    headers: {
      strictTransportSecurity: responseHeaders.strictTransportSecurity,
      contentSecurityPolicy: responseHeaders.contentSecurityPolicy,
      xContentTypeOptions: responseHeaders.xContentTypeOptions,
      referrerPolicy: responseHeaders.referrerPolicy,
      xFrameOptions: responseHeaders.xFrameOptions,
      permissionsPolicy: responseHeaders.permissionsPolicy,
    },
  }
}

/** Security evidence for a non-HTML/failed page still has a real, meaningful isHttps fact (derivable from the URL alone) — only the HTML-derived counts are zeroed. */
export function emptySecurityEvidence(finalUrl: string): SecurityEvidence {
  return {
    isHttps: isHttps(finalUrl),
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
}
