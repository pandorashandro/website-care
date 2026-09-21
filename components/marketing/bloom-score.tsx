import HealthGauge from '@/components/ui/health-gauge'
import { PILLAR_IDENTITY, type PillarKey } from '@/components/website/pillar-identity'

const ORBIT_PILLARS: PillarKey[] = ['technical-seo', 'on-page-seo', 'content', 'site-architecture', 'performance', 'accessibility', 'security']

// Sized to stay well inside a Container's inner width even on the
// narrowest real phone viewports (Container's size="xl" leaves ~288px at a
// 320px viewport after its own px-4 padding) — this is the fixed "design"
// size the orbit trigonometry below is computed against; a wider viewport
// simply gets more surrounding whitespace rather than a bigger visual.
const STAGE_PX = 260
const ORBIT_RADIUS = 108

/**
 * webioom's homepage signature visual: "Where Websites Bloom" made literal
 * without a single flower or leaf — a website's health score (the same
 * HealthGauge radial ring used across the whole product) visibly growing,
 * surrounded by the seven pillars it's actually built from, each in its own
 * point on the brand spectrum (see components/website/pillar-identity.ts).
 * The gauge's own count-up/ring-sweep animation already reads as "growth";
 * the orbiting pillars turn "one score" into "one score, built from seven
 * real things" at a glance — the same idea /website-health explains in
 * paragraphs, shown here as one shape.
 *
 * Positions are computed once at module load (fixed trigonometry over a
 * fixed 7-item array) — never `Math.random()` — so server and client
 * markup always agree and nothing shifts on hydration.
 */
const ORBIT_POSITIONS = ORBIT_PILLARS.map((key, index) => {
  const angle = (index / ORBIT_PILLARS.length) * 2 * Math.PI - Math.PI / 2
  return { key, x: Math.cos(angle) * ORBIT_RADIUS, y: Math.sin(angle) * ORBIT_RADIUS }
})

export default function BloomScore({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: STAGE_PX, height: STAGE_PX }}>
      <div className="relative h-full w-full">
        {ORBIT_POSITIONS.map(({ key, x, y }, index) => {
          const identity = PILLAR_IDENTITY[key]
          const Icon = identity.icon
          return (
            <span
              key={key}
              className="absolute left-1/2 top-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-sm motion-safe:animate-[webioom-fade-in_var(--duration-slow)_var(--ease-out)_both]"
              style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, color: identity.accent, animationDelay: `${360 + index * 70}ms` }}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )
        })}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <HealthGauge score={91} size="lg" theme="dark" aria-label="Example Overall Website Health: 91 out of 100, illustrative" />
        </div>
      </div>
    </div>
  )
}
