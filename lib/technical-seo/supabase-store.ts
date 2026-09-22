import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CrawlRunRow, CrawlPageRow, CrawlLinkRow } from '@/lib/crawler/types'
import type { TechnicalSeoStore, SaveAnalysisInput, FindingWithPages } from './store'
import type { TechnicalFindingRow, TechnicalFindingPageRow, TechnicalSeoAnalysisRow } from './types'
import type { CrawlEvidence } from './evidence'

/**
 * Phase 26 — the real, Supabase-backed TechnicalSeoStore. Uses the
 * service-role admin client throughout, exactly like
 * lib/crawler/supabase-store.ts: crawl_analyses/technical_findings/
 * technical_finding_pages grant `authenticated` SELECT only (see the
 * migration), every write happens here, after the caller
 * (app/dashboard/websites/[id]/technical-seo-actions.ts) has already
 * independently verified website ownership through the ordinary
 * session-aware client. This module performs NO ownership check of its
 * own, by design, matching every other admin-client module in this
 * codebase.
 */
export function createSupabaseTechnicalSeoStore(): TechnicalSeoStore {
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

    async saveAnalysis(input: SaveAnalysisInput): Promise<TechnicalSeoAnalysisRow> {
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

      // Replace this analysis's findings wholesale. Ordered delete-then-insert
      // (no cross-table transaction available via PostgREST): a failure in
      // between leaves "no findings for this analysis" rather than a stale
      // and fresh set mixed together — the caller can always re-run analysis
      // to recover, and no crawl evidence is ever touched by this path.
      await admin.from('technical_findings').delete().eq('crawl_analysis_id', analysis.id)

      if (input.findings.length > 0) {
        const { data: insertedFindings, error: insertError } = await admin
          .from('technical_findings')
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

        // crawl_page_id is deliberately left null here (never backfilled by
        // a second lookup) — `url` alone is the evidence a V1 UI needs, and
        // this exactly matches crawl_links.target_page_id's own established
        // precedent of staying unpopulated until a future phase has a real
        // need to join back to the exact crawl_pages row.
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
          await admin.from('technical_finding_pages').insert(pageRows)
        }
      }

      return analysis as TechnicalSeoAnalysisRow
    },

    async getLatestAnalysis(crawlRunId: string, analyzerVersion: string): Promise<TechnicalSeoAnalysisRow | null> {
      const { data } = await admin
        .from('crawl_analyses')
        .select('*')
        .eq('crawl_run_id', crawlRunId)
        .eq('analyzer_version', analyzerVersion)
        .maybeSingle()

      return (data as TechnicalSeoAnalysisRow | null) ?? null
    },

    async getFindingsWithPages(crawlAnalysisId: string): Promise<FindingWithPages[]> {
      const { data: findings } = await admin.from('technical_findings').select('*').eq('crawl_analysis_id', crawlAnalysisId)
      if (!findings || findings.length === 0) return []

      const findingIds = findings.map((finding) => finding.id as string)
      const { data: pages } = await admin.from('technical_finding_pages').select('*').in('finding_id', findingIds)

      const pagesByFinding = new Map<string, TechnicalFindingPageRow[]>()
      for (const page of (pages ?? []) as TechnicalFindingPageRow[]) {
        const existing = pagesByFinding.get(page.finding_id) ?? []
        existing.push(page)
        pagesByFinding.set(page.finding_id, existing)
      }

      return (findings as TechnicalFindingRow[]).map((finding) => ({
        ...finding,
        affectedPages: pagesByFinding.get(finding.id) ?? [],
      }))
    },
  }
}
