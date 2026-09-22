import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CrawlRunRow, CrawlPageRow } from '@/lib/crawler/types'
import type { OnPageStore, SaveAnalysisInput, FindingWithPages } from './store'
import type { OnPageFindingRow, OnPageFindingPageRow, OnPageAnalysisRow } from './types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 28 — the real, Supabase-backed OnPageStore. Uses the service-role
 * admin client throughout, exactly like lib/architecture/supabase-store.ts:
 * on_page_findings/on_page_finding_pages grant `authenticated` SELECT only
 * (see the migration), every write happens here, after the caller
 * (app/dashboard/websites/[id]/on-page-actions.ts) has already
 * independently verified website ownership through the ordinary
 * session-aware client. This module performs NO ownership check of its
 * own, by design, matching every other admin-client module in this
 * codebase.
 *
 * `crawl_analyses` is the SAME table Technical SEO and Site Architecture
 * write to — reused as-is, distinguished purely by `analyzer_version`.
 *
 * `getCrawlEvidence` deliberately does NOT fetch crawl_links — On-Page SEO
 * has no link-graph concept, so `evidence.links` is always `[]`. This
 * avoids an unnecessary query every analysis run would otherwise pay for
 * data no On-Page check reads.
 */
export function createSupabaseOnPageStore(): OnPageStore {
  const admin = createAdminClient()

  return {
    async getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null> {
      const { data: crawlRun } = await admin.from('crawl_runs').select('*').eq('id', crawlRunId).maybeSingle()
      if (!crawlRun) return null

      const { data: pages } = await admin.from('crawl_pages').select('*').eq('crawl_run_id', crawlRunId)

      return {
        crawlRun: crawlRun as CrawlRunRow,
        pages: (pages ?? []) as CrawlPageRow[],
        links: [],
      }
    },

    async saveAnalysis(input: SaveAnalysisInput): Promise<OnPageAnalysisRow> {
      const { data: analysis, error } = await admin
        .from('crawl_analyses')
        .upsert(
          {
            crawl_run_id: input.crawlRunId,
            website_id: input.websiteId,
            analyzer_version: input.analyzerVersion,
            status: 'completed',
            findings_count: input.findings.length,
            health_score: input.healthScore,
            coverage: input.coverage ?? null,
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'crawl_run_id,analyzer_version' }
        )
        .select('*')
        .single()

      if (error || !analysis) throw new Error(`Could not save analysis: ${error?.message ?? 'unknown error'}`)

      // Replace this analysis's findings wholesale — mirrors
      // lib/architecture/supabase-store.ts's own delete-then-insert
      // reasoning exactly.
      await admin.from('on_page_findings').delete().eq('crawl_analysis_id', analysis.id)

      if (input.findings.length > 0) {
        const { data: insertedFindings, error: insertError } = await admin
          .from('on_page_findings')
          .insert(
            input.findings.map((finding) => ({
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
            }))
          )
          .select('id, check_key')

        if (insertError || !insertedFindings) throw new Error(`Could not save findings: ${insertError?.message ?? 'unknown error'}`)

        const findingIdByCheckKey = new Map(insertedFindings.map((row) => [row.check_key, row.id as string]))

        const pageRows = input.findings.flatMap((finding) => {
          const findingId = findingIdByCheckKey.get(finding.checkKey)
          if (!findingId) return []
          return finding.affectedPages.map((page) => ({
            finding_id: findingId,
            crawl_page_id: null,
            url: page.url,
            affected_resource_url: page.affectedResourceUrl ?? null,
            current_state: page.currentState ?? null,
            desired_state: page.desiredState ?? null,
            proposed_change: page.proposedChange ?? null,
            remediation_type: page.remediationType ?? null,
            detail: page.detail ?? null,
          }))
        })

        if (pageRows.length > 0) {
          await admin.from('on_page_finding_pages').insert(pageRows)
        }
      }

      return analysis as OnPageAnalysisRow
    },

    async getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<OnPageAnalysisRow | null> {
      const { data } = await admin
        .from('crawl_analyses')
        .select('*')
        .eq('crawl_run_id', crawlRunId)
        .eq('analyzer_version', analyzerVersion)
        .maybeSingle()

      return (data as OnPageAnalysisRow | null) ?? null
    },

    async getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]> {
      const { data: findings } = await admin.from('on_page_findings').select('*').eq('crawl_analysis_id', crawlAnalysisId)
      if (!findings || findings.length === 0) return []

      const findingIds = findings.map((finding) => finding.id as string)
      const { data: pages } = await admin.from('on_page_finding_pages').select('*').in('finding_id', findingIds)

      const pagesByFinding = new Map<string, OnPageFindingPageRow[]>()
      for (const page of (pages ?? []) as OnPageFindingPageRow[]) {
        const existing = pagesByFinding.get(page.finding_id) ?? []
        existing.push(page)
        pagesByFinding.set(page.finding_id, existing)
      }

      return (findings as OnPageFindingRow[]).map((finding) => ({
        ...finding,
        affectedPages: pagesByFinding.get(finding.id) ?? [],
      }))
    },
  }
}
