'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { analyzeContentCrawlRun } from '../content-actions'
import Button from '@/components/ui/button'
import Alert from '@/components/ui/alert'

/**
 * Phase 29 — mirrors on-page-seo-controls.tsx exactly: analysis is a
 * single, synchronous, non-resumable action (pure computation over
 * already-fetched crawl evidence).
 */
export default function ContentControls({ websiteId, crawlRunId, hasExistingAnalysis }: { websiteId: string; crawlRunId: string; hasExistingAnalysis: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAnalyze() {
    setPending(true)
    setError(null)

    try {
      const result = await analyzeContentCrawlRun(websiteId, crawlRunId)
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
