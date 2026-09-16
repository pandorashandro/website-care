# Technical SEO score explainability (Phase 26B, Checkpoint 12)

The Technical SEO health score is computed by exactly one function, [`calculateTechnicalSeoHealth`](../lib/technical-seo/health.ts), called exactly once per analysis (`lib/technical-seo/run-analysis.ts`), and persisted verbatim onto `crawl_analyses.health_score`. **Every UI surface reads this stored value — Overview's Category Health grid (via `getTechnicalSeoCategorySummary`, `app/dashboard/websites/[id]/technical-seo-summary.ts`) and the dedicated `/technical-seo` page both select the same `crawl_analyses` row by `(crawl_run_id, analyzer_version)` and display `health_score` as-is.** Neither page recomputes it. This is the direct fix for the "Overview Technical = 62, dedicated page = 97" bug — see `docs/technical-seo-legacy-classification.md` for the full root-cause story.

## Starting point

Every analysis starts at **100**. Each persisted finding subtracts from it; nothing adds back.

## Per-finding deduction

```
deduction = SEVERITY_DEDUCTION[severity] × CONFIDENCE_MULTIPLIER[confidence] × spread
```

| Severity | Deduction |
|---|---|
| critical | 25 |
| high | 15 |
| medium | 7 |
| low | 3 |

| Confidence | Multiplier |
|---|---|
| high | 1.0 |
| medium | 0.7 |
| low | 0.4 |

A finding webioom is not fully sure about can never cost as much as the identical condition observed with certainty.

`spread` applies ONLY to page-scoped findings (`scope: 'page'`), based on `affected_page_count / totalAnalyzedPages`:

| Fraction of analyzed pages affected | Multiplier |
|---|---|
| ≥ 50% | 1.5 |
| ≥ 20% | 1.25 |
| otherwise | 1.0 |

Site-scoped findings (`scope: 'site'`) get `spread = 1` always — a site-wide finding already represents the whole (analyzed) site by definition and is never further multiplied by page count.

## Severity itself is already adjusted before this point

`severity` in the formula above is the FINAL severity — after `lib/technical-seo/severity.ts`'s own adjustment (confidence-capping, spread-based escalation from high to critical). See that file's own doc comment for the exact rules. This means the "widespread" escalation and the health-score spread multiplier are two independently-justified effects of the same underlying fact (how much of the site is affected) — one raises the finding's severity tier, the other scales its point cost within that tier; they are not the same calculation done twice.

## Anti-gaming caps

Deductions are summed **per severity tier**, then each tier's total is capped before being subtracted from 100:

| Tier | Cap |
|---|---|
| critical | 100 (effectively uncapped) |
| high | 60 |
| medium | 30 |
| low | 15 |

This is what makes the score resistant to being gamed by check *count*: adding many low-severity checks to the library, or a real site happening to trigger many minor conditions at once, can never cost more than 15 points combined — one genuine critical finding will always outweigh an arbitrarily long tail of low-severity ones. `tests/technical-seo-health.test.ts` asserts this directly.

## Final score

```
score = clamp(round(100 − Σ capped tier deductions), 0, 100)
```

## Partial-crawl behavior

`totalAnalyzedPages` (the denominator for `spread`) is the crawl's own `pages_succeeded` count — the pages actually analyzed, never the plan's page budget or an estimate of the site's true total size. A partial crawl (stopped at a plan's page limit) is scored purely on the evidence it actually gathered:

- The score is never extrapolated to "the whole site would score X."
- The UI (`/technical-seo`) shows an explicit notice when the underlying `crawl_runs.status` is `'partial'`, stating the analysis covers only the crawled pages and that additional, uncrawled pages may contain issues not reflected in the score.
- `affected_page_count`/`occurrence_count`/`unique_target_count` are always the literal counts observed — never scaled up to estimate a full-site figure.

## Worked example

A site with 20 analyzed pages, one `internal_page_5xx` finding (critical, high confidence, affecting 1 of 20 pages — 5%, so `spread = 1`) and one `missing_canonical` finding (medium, high confidence, affecting 12 of 20 pages — 60%, so `spread = 1.5`):

- critical tier: `25 × 1.0 × 1 = 25`, capped at 100 → 25
- medium tier: `7 × 1.0 × 1.5 = 10.5`, capped at 30 → 10.5
- total deduction ≈ 35.5 → score = round(100 − 35.5) = **65**
