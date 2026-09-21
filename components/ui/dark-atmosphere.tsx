/**
 * Sprint 3, Prompt 2B (final closed batch) — the one shared dark-section
 * background. Every dark moment across the public site (Security's trust
 * workflow, Pricing's value band, Product's demonstrations, Website
 * Health's pillar system, Integrations' architecture flow, the footer)
 * renders this same layered-glow atmosphere instead of each section
 * inventing its own flat `bg-brand-dark` block — which is what the
 * founder's own review called "black and call it premium."
 *
 * Three large, low-opacity radial glows (violet → azure → green, the same
 * order as `--brand-gradient`) plus a soft vignette read as genuine light
 * inside a dark environment rather than a colorful wallpaper: each glow is
 * large, heavily blurred, and positioned off-axis so they blend into one
 * atmosphere instead of sitting as three distinct colored circles. Pure
 * CSS radial-gradient + blur — no image asset, no animation library, no
 * continuous JS.
 *
 * Purely decorative (`aria-hidden`) and absolutely positioned — the
 * caller is always a `relative overflow-hidden` container (see `Section`'s
 * own dark tint) so this never affects layout or document flow.
 */
export default function DarkAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -left-1/4 -top-1/3 h-[560px] w-[560px] rounded-full opacity-[0.28] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-violet) 0%, transparent 70%)' }}
      />
      <div
        className="absolute right-[-10%] top-1/4 h-[520px] w-[520px] rounded-full opacity-[0.18] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-sky) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-1/4 left-1/3 h-[540px] w-[540px] rounded-full opacity-[0.18] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-brand-vivid) 0%, transparent 70%)' }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.4) 100%)' }} />
    </div>
  )
}
