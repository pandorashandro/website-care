import { randomUUID } from 'node:crypto'
import type { OnPageStore, SaveAnalysisInput, FindingWithPages } from '@/lib/on-page/store'
import type { OnPageFindingRow, OnPageFindingPageRow, OnPageAnalysisRow } from '@/lib/on-page/types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 28 — an in-memory OnPageStore used only by tests, mirroring
 * tests/helpers/fake-architecture-store.ts's own precedent exactly
 * (including the (crawl_run_id, analyzer_version) upsert-and-replace
 * semantics).
 */
export function createFakeOnPageStore(seedEvidence: Record<string, CrawlEvidence>) {
  const analyses: OnPageAnalysisRow[] = []
  const findings: OnPageFindingRow[] = []
  const findingPages: OnPageFindingPageRow[] = []

  const store: OnPageStore & { _analyses: OnPageAnalysisRow[]; _findings: OnPageFindingRow[]; _findingPages: OnPageFindingPageRow[] } = {
    _analyses: analyses,
    _findings: findings,
    _findingPages: findingPages,

    async getCrawlEvidence(crawlRunId: string) {
      return seedEvidence[crawlRunId] ?? null
    },

    async saveAnalysis(input: SaveAnalysisInput): Promise<OnPageAnalysisRow> {
      const now = new Date().toISOString()
      let analysis = analyses.find((a) => a.crawl_run_id === input.crawlRunId && a.analyzer_version === input.analyzerVersion)

      if (analysis) {
        Object.assign(analysis, { status: 'completed', findings_count: input.findings.length, health_score: input.healthScore, coverage: input.coverage ?? null, completed_at: now })
      } else {
        analysis = {
          id: randomUUID(),
          crawl_run_id: input.crawlRunId,
          website_id: input.websiteId,
          status: 'completed',
          analyzer_version: input.analyzerVersion,
          findings_count: input.findings.length,
          health_score: input.healthScore,
          coverage: input.coverage ?? null,
          error_message: null,
          created_at: now,
          completed_at: now,
        }
        analyses.push(analysis)
      }

      const idsToRemove = new Set(findings.filter((f) => f.crawl_analysis_id === analysis!.id).map((f) => f.id))
      for (let i = findings.length - 1; i >= 0; i--) {
        if (idsToRemove.has(findings[i].id)) findings.splice(i, 1)
      }
      for (let i = findingPages.length - 1; i >= 0; i--) {
        if (idsToRemove.has(findingPages[i].finding_id)) findingPages.splice(i, 1)
      }

      for (const finding of input.findings) {
        const findingId = randomUUID()
        findings.push({
          id: findingId,
          crawl_analysis_id: analysis.id,
          crawl_run_id: input.crawlRunId,
          website_id: input.websiteId,
          check_key: finding.checkKey,
          category: finding.category,
          scope: finding.scope,
          severity: finding.severity,
          confidence: finding.confidence,
          title: finding.title,
          explanation: finding.explanation,
          why_it_matters: finding.whyItMatters,
          recommendation: finding.recommendation,
          evidence: finding.evidence,
          affected_page_count: finding.affectedPageCount,
          occurrence_count: finding.occurrenceCount,
          unique_target_count: finding.uniqueTargetCount,
          actionability: finding.actionability,
          estimated_impact: finding.estimatedImpact,
          effort: finding.effort,
          risk: finding.risk,
          analyzer_version: input.analyzerVersion,
          created_at: now,
        })

        for (const page of finding.affectedPages) {
          findingPages.push({
            id: randomUUID(),
            finding_id: findingId,
            crawl_page_id: null,
            url: page.url,
            affected_resource_url: page.affectedResourceUrl ?? null,
            current_state: page.currentState ?? null,
            desired_state: page.desiredState ?? null,
            proposed_change: page.proposedChange ?? null,
            remediation_type: page.remediationType ?? null,
            detail: page.detail ?? null,
          })
        }
      }

      return { ...analysis }
    },

    async getLatestAnalysis(crawlRunId: string, analyzerVersion: string) {
      const found = analyses.find((a) => a.crawl_run_id === crawlRunId && a.analyzer_version === analyzerVersion)
      return found ? { ...found } : null
    },

    async getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]> {
      return findings
        .filter((f) => f.crawl_analysis_id === crawlAnalysisId)
        .map((finding) => ({ ...finding, affectedPages: findingPages.filter((p) => p.finding_id === finding.id) }))
    },
  }

  return store
}
