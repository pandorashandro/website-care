import Image from 'next/image'
import { cn } from '@/lib/ui/cn'

export type LogoProps = {
  /** Controls the rendered height; width follows automatically to preserve the source aspect ratio. Defaults to a compact size — pass a taller value (e.g. 'h-10') at call sites that want the logo more prominent. */
  className?: string
  /** 'light' (default) renders the logo as-is, for white/light surfaces matching its own background. 'dark' wraps it in a small white card so it stays legible on the webioom navy (sidebar, dark footer/hero). */
  variant?: 'light' | 'dark'
}

const LOGO_WIDTH = 1193
const LOGO_HEIGHT = 241

/**
 * The approved webioom wordmark — brand-reference/webioom-logo1.png, copied
 * unmodified to public/brand/webioom-logo.png and rendered directly via
 * next/image. This is the actual supplied artwork, not a recreation.
 *
 * The source file has a solid white background baked in (verified: every
 * pixel, including all four corners, is fully opaque). On the app's dark
 * navy surfaces it's presented inside a small white card instead of an
 * algorithmically "de-whited" version — extracting alpha from a flat
 * background is reliable for the near-black glyph strokes but measurably
 * distorts the brand-green stroke at partial pixel coverage, and the logo
 * must not be recolored or approximated. A transparent production export
 * would remove the need for the card.
 */
export default function Logo({ className, variant = 'light' }: LogoProps) {
  const image = (
    <Image
      src="/brand/webioom-logo.png"
      alt="webioom"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority
      className={cn('h-7 w-auto', className)}
    />
  )

  if (variant === 'dark') {
    return <span className="inline-flex items-center rounded-md bg-white px-2 py-1.5">{image}</span>
  }

  return image
}
