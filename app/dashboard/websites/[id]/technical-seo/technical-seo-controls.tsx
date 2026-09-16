'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { analyzeCrawlRun } from '../technical-seo-actions'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

/**
 * Phase 26 — the one control that runs Technical SEO analysis. Unlike
 * site-scan-controls.tsx's crawl-continuation loop, analysis is a single,
 * synchronous, non-resumable action (see lib/technical-seo/run-analysis.ts's
 * own doc comment: it's pure computation over already-fetched evidence, so
 * one call always either fully succeeds or fails outright) — no auto-retry
 * loop, no wall-clock batching, just one request and a refresh.
 */
export default function TechnicalSeoControls({ websiteId, crawlRunId, hasExistingAnalysis }: { websiteId: string; crawlRunId: string; hasExistingAnalysis: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAnalyze() {
    setPending(true)
    setError(null)

    try {
      const result = await analyzeCrawlRun(websiteId, crawlRunId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <Button type="button" variant="outline" disabled={pending} className="w-full" onClick={handleAnalyze}>
        {pending ? 'Analyzing…' : hasExistingAnalysis ? 'Re-analyze' : 'Analyze This Crawl'}
      </Button>

      {error && (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  )
}
