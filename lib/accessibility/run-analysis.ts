import type { PillarStore } from '@/lib/pillars/store'
import { runPillarAnalysis, type AnalyzePillarResult } from '@/lib/pillars/run-analysis'
import { ACCESSIBILITY_ANALYZER_VERSION } from '@/lib/pillars/types'
import { analyzeMissingImageAlt } from './checks/missing-image-alt'
import { analyzeMissingHtmlLang } from './checks/missing-html-lang'
import { analyzeFormInputsMissingLabel } from './checks/form-inputs-missing-label'
import { analyzeLinksMissingAccessibleName } from './checks/links-missing-accessible-name'
import { analyzeDuplicateIds } from './checks/duplicate-ids'
import { analyzeIframeMissingTitle } from './checks/iframe-missing-title'
import { analyzeManualTestingNotice } from './checks/manual-testing-notice'

export const ANALYZER_VERSION = ACCESSIBILITY_ANALYZER_VERSION

const CHECKS = [
  analyzeMissingImageAlt,
  analyzeMissingHtmlLang,
  analyzeFormInputsMissingLabel,
  analyzeLinksMissingAccessibleName,
  analyzeDuplicateIds,
  analyzeIframeMissingTitle,
  analyzeManualTestingNotice,
]

/** Unified webioom engine, Prompt 2 — Accessibility canonical analysis entry point. */
export async function analyzeAccessibility(store: PillarStore, crawlRunId: string): Promise<AnalyzePillarResult> {
  return runPillarAnalysis('accessibility', ANALYZER_VERSION, CHECKS, store, crawlRunId)
}
