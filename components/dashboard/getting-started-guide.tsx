import { CheckCircle2, Circle } from 'lucide-react'
import Card from '@/components/ui/card'

type Step = { label: string; done: boolean }

/**
 * Derived entirely from real, already-loaded dashboard state — no
 * onboarding_progress table, no dismissal state. Only ever rendered by the
 * dashboard page while at least one measurable step is still incomplete;
 * once a completed scan exists, this component simply isn't rendered
 * anymore rather than needing its own "hide" logic.
 */
export default function GettingStartedGuide({ hasWebsite, hasCompletedScan }: { hasWebsite: boolean; hasCompletedScan: boolean }) {
  const steps: Step[] = [
    { label: 'Create account', done: true },
    { label: 'Add your website', done: hasWebsite },
    { label: 'Run your first scan', done: hasCompletedScan },
  ]

  return (
    <Card padding="sm" className="bg-surface-muted">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Getting started</p>
      <ul className="mt-2 space-y-1.5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            )}
            <span className={step.done ? 'text-gray-500 line-through' : 'font-medium text-gray-900'}>{step.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
