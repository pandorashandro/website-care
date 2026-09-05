/**
 * Phase 23.1 — barrel for the entitlement engine. Every consumer (a Server
 * Action deciding whether to allow something, a future Phase 23.3 UI
 * component, Phase 24's scheduler) should import from `@/lib/entitlements`
 * rather than reaching into an individual file, so which module owns which
 * piece of this system can keep changing internally without updating every
 * call site. See docs/entitlements.md for the full picture.
 */
export * from './plans'
export * from './subscription'
export * from './capabilities'
export * from './service'
