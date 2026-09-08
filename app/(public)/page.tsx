import type { Metadata } from 'next'
import Container from '@/components/ui/container'

export const metadata: Metadata = {
  title: 'webioom — Where Websites Bloom.',
  description:
    'webioom is a website health and optimization platform built to help websites improve continuously. Launching soon.',
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-b border-border-dark bg-brand-dark px-4 py-24 text-center sm:py-32">
      <Container size="sm">
        <h1 className="text-4xl font-semibold tracking-tight text-text-on-dark sm:text-5xl">WEBIOOM</h1>
        <p className="mt-3 text-sm font-semibold tracking-wide text-brand-vivid">Where Websites Bloom.</p>

        <p className="mt-10 text-lg text-text-on-dark-muted">We&rsquo;re getting ready to launch.</p>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-text-on-dark-muted">
          WEBIOOM is a website health and optimization platform built to help websites improve continuously.
        </p>

        <p className="mt-10 text-sm font-semibold uppercase tracking-wide text-brand-vivid">Launching soon.</p>
      </Container>
    </div>
  )
}
