import { WEBSITE_ADDED_QUERY_PARAM, WEBSITE_ADDED_QUERY_VALUE } from './website-added-marker'

export type WebsiteAddedMarkerResult = {
  /** Whether the one-time website_added marker was present on this URL. */
  markerPresent: boolean
  /** The same URL (path + remaining query string + hash) with only the marker removed — every other param and the hash are preserved untouched. */
  cleanedUrl: string
}

/**
 * Pure URL logic extracted from components/analytics/track-website-added.tsx
 * so the exact "is the marker present, and what should the URL become after
 * removing only it" decision is directly unit-testable in this project's
 * Node-only test environment (see vitest.config.ts) without a DOM/React
 * rendering environment — this needs no globals at all, just a full href in
 * and a plain result out.
 */
export function readAndStripWebsiteAddedMarker(href: string): WebsiteAddedMarkerResult {
  const url = new URL(href)
  const markerPresent = url.searchParams.get(WEBSITE_ADDED_QUERY_PARAM) === WEBSITE_ADDED_QUERY_VALUE

  url.searchParams.delete(WEBSITE_ADDED_QUERY_PARAM)

  return {
    markerPresent,
    cleanedUrl: `${url.pathname}${url.search}${url.hash}`,
  }
}
