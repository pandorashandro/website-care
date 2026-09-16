# Category engine contract (Phase 26B — reference architecture)

Technical SEO (`lib/technical-seo/`) is the reference implementation for how every one of webioom's seven locked Bible categories (Technical SEO, On-Page SEO, Content, Site Architecture, Performance, Accessibility, Security) should eventually work. **Only Technical SEO is built** — this document exists so Phase 27+ can build the other six without re-deriving this shape from scratch, per Phase 26B's explicit instruction to create the reusable contract now without implementing the future engines.

A category engine owns exactly six things, each with a concrete Technical SEO counterpart:

| Responsibility | Question it answers | Technical SEO's implementation |
|---|---|---|
| **Score** | How healthy is this category? | `lib/technical-seo/health.ts`, persisted on `crawl_analyses.health_score`, read verbatim everywhere — never recomputed (see `docs/technical-seo-score-explainability.md`) |
| **Findings** | What exactly is wrong? | `technical_findings` — one row per distinct, aggregated problem (`lib/technical-seo/aggregate.ts`) |
| **Evidence** | What observable facts prove it? | `technical_finding_pages` — typed `current_state`/`desired_state` (`StateValue`) plus a `detail` JSONB escape hatch per instance |
| **Solution** | What specifically should change? | `proposed_change` (human text) + `remediation_type` (a closed, reusable vocabulary — see below) |
| **Actionability** | What can webioom actually do? | `actionability` — the canonical five-value vocabulary (see below), sourced from real platform capability registries, never wishful |
| **Verification** | How would webioom prove it's resolved? | Re-analysis of a fresh crawl — a finding disappearing on the next `(crawl_run, analyzer_version)` analysis IS the verification; no separate verification subsystem exists or is needed yet |

## The reusable vocabulary (`lib/technical-seo/types.ts`)

These types are written generically — nothing in them is Technical-SEO-specific — precisely so a future category engine can reuse them directly:

- **`Actionability`**: `'safe_fix' | 'prepared_fix' | 'guided_fix' | 'developer_required' | 'monitor'`. A category engine may only ever assign `safe_fix`/`prepared_fix` when a REAL execution backend exists for that exact change (see `lib/fixes/fixability.ts`/`lib/integrations/` as the source of truth for what currently exists) — never based on what would be nice to automate later.
- **`RemediationType`**: `'url_replacement' | 'directive_change' | 'canonical_change' | 'sitemap_correction' | 'robots_correction' | 'schema_correction' | 'guided_instruction'`. Deliberately not exhaustive of every possible future remediation — a new category engine can extend this union as it needs new kinds of change, without altering the shape around it.
- **`StateValue`**: `{ label: string; value: string | null }` — a labeled, human-readable current-or-desired value. Used identically whether the "state" is an HTTP status, a canonical URL, a directive, or (for a future engine) a Core Web Vitals metric or a color-contrast ratio.
- **`RawFindingPageEvidence`**: the generic per-instance evidence shape — `url` (the anchor/source resource), an optional `affectedResourceUrl` (a DIFFERENT resource the problem is actually about, e.g. a broken link's target), optional `currentState`/`desiredState`/`proposedChange`/`remediationType`, and a `detail` JSONB escape hatch for anything not worth a first-class typed field yet.
- **Three-way counting**: `affectedPageCount` (distinct anchor resources) / `occurrenceCount` (distinct anchor+target instances) / `uniqueTargetCount` (distinct "other resource" values) are computed generically in `aggregate.ts` from the SAME evidence shape — any category engine whose findings have a source/target relationship (not just Technical SEO's redirects/links) gets this distinction for free, rather than needing its own bespoke counting logic.

## The Overview summary contract (`lib/category-engine/types.ts`)

Overview's "Category Health" grid is a SUMMARY layer; the dedicated category page is the DETAIL layer — both must read the same underlying authoritative analysis, never two independently-computed truths. `CategorySummary` is the reusable read-model shape a Category Health tile renders for any category engine, without recomputing that category's own analysis:

```ts
type CategorySummary = {
  categoryKey: string
  status: 'not_analyzed' | 'analyzed'
  score: number | null
  findingsCount: number | null
  partial: boolean
  analyzedAt: string | null
  analyzerVersion: string | null
}
```

Technical SEO is the first real implementation: `app/dashboard/websites/[id]/technical-seo-summary.ts`'s `getTechnicalSeoCategorySummary(websiteId)` is the ONE server-side retrieval Overview calls, backed by a pure mapping function (`buildTechnicalSeoCategorySummary`) unit-tested in isolation from Supabase. It selects the exact same `crawl_analyses` row (by `crawl_run_id` + `analyzer_version`) the dedicated `/technical-seo` page reads — never a second query path, never a fallback to a legacy score. A future category engine's own `get<Category>CategorySummary(websiteId)` should follow the identical shape: one thin DB-touching wrapper delegating to one pure, testable mapping function.

## What a new category engine needs to bring

1. Its own `crawl_pages`/`crawl_links`-equivalent evidence source (Technical SEO reuses Phase 25's crawl evidence directly; a Performance engine might need Core Web Vitals evidence Phase 25 does not currently capture — extending crawl evidence additively, the same way Phase 26B added `redirect_count`/structured-data/hreflang columns, is the expected pattern rather than a parallel crawler).
2. Its own `CheckKey` union and analyzer functions, following `lib/technical-seo/checks/`'s "one pure function per category, `(evidence, context) => RawFinding[]`" shape.
3. Its own actionability/remediation-type classification map (like `lib/technical-seo/actionability.ts`), honest about what the ACTUAL connected-platform capabilities can execute today.
4. Its own health calculation reusing `HealthFindingInput`'s shape (severity/confidence/scope/affectedPageCount) if the same deduction-with-caps model applies, or a documented departure from it if the category's health genuinely needs a different model (e.g. Performance might reasonably be driven by a measured metric rather than a deduction count).
5. Its own `crawl_analyses`-equivalent persistence row (or, more likely once multiple category engines exist, a shared `category_analyses` table keyed by `(crawl_run_id, category, analyzer_version)` — a refactor Phase 27+ should consider once a second engine exists and the pattern is proven twice, not before).

## What must NOT be duplicated per category engine

- **Persistence pattern**: the ports-and-adapters `Store` interface (`TechnicalSeoStore`) + real Supabase implementation + in-memory test fake is a proven, reviewable pattern (mirrors `lib/crawler/store.ts`'s own precedent) — every future engine should follow it, not invent a new persistence style.
- **Ownership/RLS pattern**: session-aware ownership check in a `*-actions.ts` Server Action file, service-role writes only inside the store, RLS scoping every new table through `websites.user_id` — established by Phase 25, reused unchanged by Phase 26, and the expected pattern for every future engine's tables.
- **"One authoritative score" rule**: Checkpoint 3's rule (ONE ENGINE → ONE ANALYSIS → ONE SCORE → used everywhere) applies to every future category exactly as it now applies to Technical SEO. The Overview must never compute a category score itself once that category's canonical engine exists — it selects the persisted value via a thin, reusable summary retrieval (see `lib/category-engine/types.ts`'s `CategorySummary` and `app/dashboard/websites/[id]/technical-seo-summary.ts`'s `getTechnicalSeoCategorySummary`), rendered as a tile inside the existing Overview "Category Health" grid — never as a standalone card outside it.
