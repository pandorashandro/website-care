import type { PillarStore } from '@/lib/pillars/store'
import { runPillarAnalysis, type AnalyzePillarResult } from '@/lib/pillars/run-analysis'
import { SECURITY_ANALYZER_VERSION } from '@/lib/pillars/types'
import { analyzeNotUsingHttps } from './checks/not-using-https'
import { analyzeMixedContent } from './checks/mixed-content'
import { analyzeInsecureForms } from './checks/insecure-forms'
import { analyzeSecurityHeadersOpportunity } from './checks/security-headers-opportunity'
import { analyzeHygieneScopeNotice } from './checks/hygiene-scope-notice'

export const ANALYZER_VERSION = SECURITY_ANALYZER_VERSION

const CHECKS = [analyzeNotUsingHttps, analyzeMixedContent, analyzeInsecureForms, analyzeSecurityHeadersOpportunity, analyzeHygieneScopeNotice]

/** Unified webioom engine, Prompt 2 — Security canonical analysis entry point. "Security Health" here means website security HYGIENE — never a penetration test, never a claim of absolute security (see hygiene-scope-notice.ts). */
export async function analyzeSecurity(store: PillarStore, crawlRunId: string): Promise<AnalyzePillarResult> {
  return runPillarAnalysis('security', ANALYZER_VERSION, CHECKS, store, crawlRunId)
}
