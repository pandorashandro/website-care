/**
 * A single-use "has this already fired" latch, extracted as a plain
 * function so it is directly unit-testable in this project's Node-only
 * test environment (see vitest.config.ts) without needing a DOM/React
 * rendering environment. `components/analytics/track-page-view.tsx` holds
 * one instance per component mount (via `useRef`) and consults it inside a
 * mount-only `useEffect` — ordinary re-renders (a toggle change, unrelated
 * local state) never create a new instance and never re-run the effect's
 * `[]` dependency array, so `shouldFire()` naturally only ever returns
 * `true` once per genuine mount. A real later remount (navigating away and
 * back) creates a fresh instance, correctly allowed to fire again.
 */
export function createPageViewGuard() {
  let fired = false
  return {
    shouldFire(): boolean {
      if (fired) return false
      fired = true
      return true
    },
  }
}
