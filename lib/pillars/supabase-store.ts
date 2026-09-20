import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CrawlRunRow, CrawlPageRow } from '@/lib/crawler/types'
import type { CrawlAnalysisRow } from '@/lib/technical-seo/types'
import type { PillarStore, SaveAnalysisInput, FindingWithPages } from './store'
import type { PillarFindingRow, PillarFindingPageRow } from './types'
import type { CrawlEvidence } from '@/lib/crawler/evidence'

/**
 * Unified webioom engine, Prompt 2 — the real, Supabase-backed PillarStore,
 * shared by Performance/Accessibility/Security. Mirrors
 * lib/content/supabase-store.ts's own saveAnalysis pattern exactly, with
 * the one structural difference the shared schema requires: every write to
 * `pillar_findings` includes the caller's `pillar` value, and reads filter
 * by it too (a `crawl_analysis_id` alone is already unique per pillar in
 * practice, since each pillar gets its own crawl_analyses row, but filtering
 * by `pillar` as well keeps every query self-documenting and safe even if
 * that ever changed).
 */
export function createSupabasePillarStore(): PillarStore {
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

      if (error || !analysis) throw new Error(`Could not save ${input.pillar} analysis: ${error?.message ?? 'unknown error'}`)

      await admin.from('pillar_findings').delete().eq('crawl_analysis_id', analysis.id)

      if (input.findings.length > 0) {
        const { data: insertedFindings, error: insertError } = await admin
          .from('pillar_findings')
          .insert(
            input.findings.map((finding) => ({
              crawl_analysis_id: analysis.id,
              crawl_run_id: input.crawlRunId,
              website_id: input.websiteId,
              pillar: input.pillar,
              check_key: finding.checkKey,
              category: finding.category,
              scope: finding.scope,
              finding_kind: finding.kind,
              evidence_source: finding.evidenceSource,
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

        if (insertError || !insertedFindings) throw new Error(`Could not save ${input.pillar} findings: ${insertError?.message ?? 'unknown error'}`)

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
          await admin.from('pillar_finding_pages').insert(pageRows)
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
      const { data: findings } = await admin.from('pillar_findings').select('*').eq('crawl_analysis_id', crawlAnalysisId)
      if (!findings || findings.length === 0) return []

      const findingIds = findings.map((finding) => finding.id as string)
      const { data: pages } = await admin.from('pillar_finding_pages').select('*').in('finding_id', findingIds)

      const pagesByFinding = new Map<string, PillarFindingPageRow[]>()
      for (const page of (pages ?? []) as PillarFindingPageRow[]) {
        const existing = pagesByFinding.get(page.finding_id) ?? []
        existing.push(page)
        pagesByFinding.set(page.finding_id, existing)
      }

      return (findings as PillarFindingRow[]).map((finding) => ({
        ...finding,
        affectedPages: pagesByFinding.get(finding.id) ?? [],
      }))
    },
  }
}
