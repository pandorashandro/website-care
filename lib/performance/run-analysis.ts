import type { PillarStore } from '@/lib/pillars/store'
import { runPillarAnalysis, type AnalyzePillarResult } from '@/lib/pillars/run-analysis'
import { PERFORMANCE_ANALYZER_VERSION } from '@/lib/pillars/types'
import { analyzeHeavyPageWeight } from './checks/heavy-page-weight'
import { analyzeRenderBlockingResources } from './checks/render-blocking-resources'
import { analyzeExcessiveResourceCount } from './checks/excessive-resource-count'
import { analyzeImageDimensions } from './checks/image-dimensions'
import { analyzeLazyLoadingOpportunity } from './checks/lazy-loading-opportunity'
import { analyzeMissingCompression } from './checks/missing-compression'
import { analyzeMissingCachingOpportunity } from './checks/missing-caching-opportunity'
import { analyzeCoreWebVitalsNotice } from './checks/core-web-vitals-notice'

export const ANALYZER_VERSION = PERFORMANCE_ANALYZER_VERSION

const CHECKS = [
  analyzeHeavyPageWeight,
  analyzeRenderBlockingResources,
  analyzeExcessiveResourceCount,
  analyzeImageDimensions,
  analyzeLazyLoadingOpportunity,
  analyzeMissingCompression,
  analyzeMissingCachingOpportunity,
  analyzeCoreWebVitalsNotice,
]

/**
 * Unified webioom engine, Prompt 2 — Performance canonical analysis entry
 * point. A thin wrapper supplying Performance's own check list to the
 * shared lib/pillars/run-analysis.ts orchestrator.
 */
export async function analyzePerformance(store: PillarStore, crawlRunId: string): Promise<AnalyzePillarResult> {
  return runPillarAnalysis('performance', ANALYZER_VERSION, CHECKS, store, crawlRunId)
}
