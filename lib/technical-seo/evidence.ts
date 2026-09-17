/**
 * Phase 27 — this module's actual implementation moved to
 * lib/crawler/evidence.ts (a second category engine, lib/architecture/,
 * needed the exact same crawl-evidence helpers, and none of them were ever
 * Technical-SEO-specific). Re-exported here unchanged so no existing
 * Technical SEO import (`from '../evidence'` / `from '@/lib/technical-seo/evidence'`)
 * needs to change.
 */
export * from '@/lib/crawler/evidence'
