import type { Metadata } from 'next'
import Container from '@/components/ui/container'
import Logo from '@/components/brand/logo'

export const metadata: Metadata = {
  title: 'webioom — Where Websites Bloom.',
  description:
    'webioom is a website health and optimization platform built to help websites improve continuously. Launching soon.',
}

/**
 * Sprint 3, Prompt 2B (final pass) — a beautiful premium pre-launch moment,
 * not the final marketing homepage (that remains explicitly out of scope —
 * see this prompt's own Section 31). Kept to one screen, no new sections,
 * no product storytelling. What changes here is quality: a much larger
 * logo (the founder's repeated "too small" feedback), two layered
 * brand-spectrum glows instead of one flat blob for real depth, a fine
 * dot-grid texture (a restrained premium-SaaS dark-hero cue, not copied
 * from any specific site), and a staggered entrance so the page arrives as
 * a sequence rather than all at once.
 */
export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden bg-brand-dark px-4 py-24 text-center sm:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(244,246,248,0.14) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-[12%] top-[8%] h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-violet) 0%, transparent 70%)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[6%] right-[10%] h-[480px] w-[480px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-brand-vivid) 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <Container size="sm" className="relative flex flex-col items-center">
        <div className="motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]">
          <Logo variant="dark" className="h-20 sm:h-24" />
        </div>
        <p
          className="mt-6 text-base font-semibold tracking-wide text-brand-vivid motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]"
          style={{ animationFillMode: 'both', animationDelay: '120ms' }}
        >
          Where Websites Bloom.
        </p>

        <h1
          className="mt-14 text-2xl font-semibold tracking-tight text-text-on-dark sm:text-3xl motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]"
          style={{ animationFillMode: 'both', animationDelay: '220ms' }}
        >
          We&rsquo;re getting ready to launch.
        </h1>
        <p
          className="mx-auto mt-4 max-w-md text-base leading-relaxed text-text-on-dark-muted motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]"
          style={{ animationFillMode: 'both', animationDelay: '320ms' }}
        >
          webioom is a website health and optimization platform built to help websites improve continuously.
        </p>

        <div
          className="mt-14 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 motion-safe:animate-[webioom-rise-in_var(--duration-slow)_var(--ease-out)_both]"
          style={{ animationFillMode: 'both', animationDelay: '420ms' }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-vivid" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-vivid">Launching soon</span>
        </div>
      </Container>
    </div>
  )
}
