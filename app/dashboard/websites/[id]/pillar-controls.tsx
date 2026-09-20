'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

type AnalyzeResult = { ok: true; findingsCount: number; healthScore: number } | { ok: false; error: string }

/**
 * Unified webioom engine, Prompt 2 — the shared manual "Analyze"/"Re-analyze"
 * control for Performance/Accessibility/Security, mirroring
 * content-controls.tsx/on-page-seo-controls.tsx's own established pattern
 * exactly. A manual fallback only — under the unified Scan Website pipeline
 * (scan-website-controls.tsx) these three now analyze automatically after
 * every crawl, so a customer only ever needs this if they want to re-run
 * just this one category without a full re-scan.
 */
export default function PillarControls({
  websiteId,
  crawlRunId,
  hasExistingAnalysis,
  analyzeAction,
}: {
  websiteId: string
  crawlRunId: string
  hasExistingAnalysis: boolean
  analyzeAction: (websiteId: string, crawlRunId: string) => Promise<AnalyzeResult>
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAnalyze() {
    setPending(true)
    setError(null)

    try {
      const result = await analyzeAction(websiteId, crawlRunId)
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
