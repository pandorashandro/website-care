'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export type ScrollRevealProps = {
  children: ReactNode
  className?: string
  /** Staggers entrance across a row/grid of ScrollReveal siblings (e.g. pricing cards, feature grids) — a plain transition-delay, not a separate animation. */
  delayMs?: number
}

/**
 * Sprint 3, Prompt 2B (final pass) — Wellows-inspired scroll-driven reveal
 * for PUBLIC/MARKETING surfaces only (per that prompt's Section 9: public
 * pages may impress, product/workspace pages must stay restrained and fast).
 * Never used inside the dashboard or a website workspace route.
 *
 * Deliberately a plain IntersectionObserver, not a library — the brief
 * explicitly forbids adding a new animation dependency, and CSS-only
 * scroll-linked animation (`animation-timeline: view()`) still lacks
 * cross-browser support, so this is the smallest dependency-free way to get
 * real "animates in as it scrolls into view" behavior.
 *
 * The `.scroll-reveal` class (see globals.css) is only ever added by this
 * effect, never present in server-rendered markup — so content is never
 * hidden from a visitor whose JavaScript fails to load; it simply never
 * animates for them, which is the correct fallback either way.
 */
export default function ScrollReveal({ children, className, delayMs = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Direct classList mutation, not React state — this only ever
    // synchronizes the DOM with an external system (the IntersectionObserver
    // callback), so there is no re-render to schedule and nothing for
    // react-hooks/set-state-in-effect to flag. It also means server-rendered
    // markup never carries `.scroll-reveal` (added here, after mount), so a
    // visitor whose JS fails to load simply sees the content, never hidden.
    node.classList.add('scroll-reveal')

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('is-visible')
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={className} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
      {children}
    </div>
  )
}
