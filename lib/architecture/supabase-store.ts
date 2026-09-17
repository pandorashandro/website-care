import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CrawlRunRow, CrawlPageRow, CrawlLinkRow } from '@/lib/crawler/types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'
import type { ArchitectureStore, SaveAnalysisInput, FindingWithPages } from './store'
import type { ArchitectureFindingRow, ArchitectureFindingPageRow } from './types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Phase 27 — the real, Supabase-backed ArchitectureStore. Uses the
 * service-role admin client throughout, exactly like
 * lib/technical-seo/supabase-store.ts: architecture_findings/
 * architecture_finding_pages grant `authenticated` SELECT only (see the
 * migration), every write happens here, after the caller
 * (app/dashboard/websites/[id]/site-architecture-actions.ts) has already
 * independently verified website ownership through the ordinary
 * session-aware client. This module performs NO ownership check of its
 * own, by design, matching every other admin-client module in this
 * codebase.
 *
 * `crawl_analyses` is the SAME table Technical SEO writes to — reused
 * as-is, distinguished purely by `analyzer_version`. This store never reads
 * or writes a `technical_findings`/`technical_finding_pages` row.
 */
export function createSupabaseArchitectureStore(): ArchitectureStore {
  const admin = createAdminClient()

  return {
    async getCrawlEvidence(crawlRunId: string): Promise<CrawlEvidence | null> {
      const { data: crawlRun } = await admin.from('crawl_runs').select('*').eq('id', crawlRunId).maybeSingle()
      if (!crawlRun) return null

      const [{ data: pages }, { data: links }] = await Promise.all([
        admin.from('crawl_pages').select('*').eq('crawl_run_id', crawlRunId),
        admin.from('crawl_links').select('*').eq('crawl_run_id', crawlRunId),
      ])

      return {
        crawlRun: crawlRun as CrawlRunRow,
        pages: (pages ?? []) as CrawlPageRow[],
        links: (links ?? []) as CrawlLinkRow[],
      }
    },

    async saveAnalysis(input: SaveAnalysisInput): Promise<CrawlAnalysisRow> {
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
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'crawl_run_id,analyzer_version' }
        )
        .select('*')
        .single()

      if (error || !analysis) throw new Error(`Could not save analysis: ${error?.message ?? 'unknown error'}`)

      // Replace this analysis's findings wholesale — mirrors
      // lib/technical-seo/supabase-store.ts's own delete-then-insert
      // reasoning exactly.
      await admin.from('architecture_findings').delete().eq('crawl_analysis_id', analysis.id)

      if (input.findings.length > 0) {
        const { data: insertedFindings, error: insertError } = await admin
          .from('architecture_findings')
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
          await admin.from('architecture_finding_pages').insert(pageRows)
        }
      }

      return analysis as CrawlAnalysisRow
    },

    async getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<CrawlAnalysisRow | null> {
      const { data } = await admin
        .from('crawl_analyses')
        .select('*')
        .eq('crawl_run_id', crawlRunId)
        .eq('analyzer_version', analyzerVersion)
        .maybeSingle()

      return (data as CrawlAnalysisRow | null) ?? null
    },

    async getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]> {
      const { data: findings } = await admin.from('architecture_findings').select('*').eq('crawl_analysis_id', crawlAnalysisId)
      if (!findings || findings.length === 0) return []

      const findingIds = findings.map((finding) => finding.id as string)
      const { data: pages } = await admin.from('architecture_finding_pages').select('*').in('finding_id', findingIds)

      const pagesByFinding = new Map<string, ArchitectureFindingPageRow[]>()
      for (const page of (pages ?? []) as ArchitectureFindingPageRow[]) {
        const existing = pagesByFinding.get(page.finding_id) ?? []
        existing.push(page)
        pagesByFinding.set(page.finding_id, existing)
      }

      return (findings as ArchitectureFindingRow[]).map((finding) => ({
        ...finding,
        affectedPages: pagesByFinding.get(finding.id) ?? [],
      }))
    },
  }
}
