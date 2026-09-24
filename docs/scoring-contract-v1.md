# WEBIOOM Scoring Contract V1 (2026-09-24)

This document is the frozen, written definition of what a webioom pillar score and Overall Website Health number mean. It exists because a real, reported failure (a minimal placeholder website reaching an Overall Website Health of ~94) traced back to an architectural gap: the scoring model could express "no problems were detected" but had no way to express "not enough was observed to justify a high score." This document is the contract every current and future scoring change must be checked against — see `docs/category-score-standard.md` for the companion document on *how* a deduction formula must behave (evidence-driven, proportional, bounded, etc.); this document is about what the resulting *number itself is allowed to claim*.

## 1. What a 0-100 pillar score means

A pillar score is not "how many defects were found," and it is not "how much was inspected." It is a single claim:

> **Given the evidence webioom was able to observe for the checks this pillar is responsible for, this score reflects how well that evidence satisfies the applicable requirements — and it is only issued at all when enough of that evidence exists to make the claim honestly.**

Three things follow directly from this:

- **100 must be earned, never assumed.** A score of 100 means "every applicable, sufficiently-evidenced check in this pillar found no defect." It never means "there was nothing to check" or "almost nothing was inspected." Zero findings is a NECESSARY condition for 100, never a SUFFICIENT one — sufficiency also requires that the pillar had real, applicable evidence to have found something in.
- **A low score must be caused by an observed defect**, traceable to a specific, persisted finding — never a structural artifact of small site size, missing optional features, or thin evidence. Insufficient evidence is a different failure mode (see below) and must never be expressed by silently lowering a score.
- **When there genuinely isn't enough applicable evidence, the pillar is WITHHELD (`not_analyzed`, score `null`), never assigned a discounted number.** A capped/ceilinged score ("we'll give this a maximum of 84") still claims "this was scored" when the honest fact is "there was nothing applicable here to score." Withholding is the truthful alternative — see Section 3.

### 0, 50, and 100

- **0** means every applicable check that could run found the worst possible, maximally severe and confident defect webioom's evidence model can express for this pillar — the theoretical floor, essentially never reached in practice by a real site (a real site with SOME clean signal will always sit above 0).
- **50** is not a defined midpoint of "average" — it is wherever the deduction formula happens to land when a mix of real, confirmed defects (of varying severity, confidence, and how much of the site they affect) has been subtracted from a starting 100. It has no independent meaning beyond "a substantial, confirmed cost has been deducted from a full evidence base" — see `lib/scanner/health-label.ts`'s own `<50` "Poor" boundary for how it is communicated.
- **100** means: every check this pillar could apply to the observed evidence ran, found no defect, and there was enough of that evidence (see Section 2) for the absence of a defect to be a meaningful, trustworthy claim rather than a vacuous one.

## 2. Quality vs. Coverage vs. Confidence vs. Applicability vs. Completeness

These are five genuinely different concepts this model keeps distinct rather than collapsing into one number wherever possible:

- **Quality** — how well the OBSERVED, APPLICABLE evidence satisfies the pillar's requirements. This is what the deduction formula measures.
- **Evidence coverage** — how much of the site/page population that COULD be evaluated actually was (e.g. `eligiblePageCount` vs. total pages). Represented per-pillar as `coverage.level: 'none' | 'low' | 'adequate'` (Content additionally reports its own finer-grained extraction/dimension coverage internally).
- **Confidence** — how sure webioom is that a SPECIFIC finding is real (the existing per-finding `confidence: 'high' | 'medium' | 'low'`, already a first-class part of every deduction).
- **Applicability** — whether a given check's precondition is even met by this site at all (e.g. duplicate-title detection requires ≥2 eligible pages; structured-data-invalid requires structured data to be present in the first place). An inapplicable check contributes nothing — not a pass, not a fail, not evidence of anything.
- **Completeness** — whether the CURRENT ANALYSIS reflects the FULL site (a `partial` crawl flag, tracked separately and already orthogonal to the coverage/quality distinction above).

**Quality and coverage are never multiplied together into a single blended number.** A pillar's score is EITHER a genuine, quality-earned deduction score (when coverage/applicability are sufficient) OR withheld entirely (when they are not) — never a quality score discounted by a coverage factor. This was a deliberate rejection of an earlier "evidence ceiling" mechanism (a flat maximum score applied when coverage was thin) — audited in this same pass and found conceptually indefensible: it implied "we scored this, just not very high" when the true fact for insufficient evidence is "there was nothing applicable here to score." See Section 3 for what replaced it.

## 3. Per-pillar minimum evidence, decided per pillar's actual checks

There is no single, cross-pillar "minimum page count." What counts as sufficient evidence is decided by what a pillar's OWN checks actually need to be applicable at all:

- **Technical SEO** — crawlability/robots/sitemap/URL-protocol checks need no HTML content at all (they evaluate transport-level and file-level evidence) and remain fully applicable even when 0 pages are real HTML. Indexability/canonical/structured-data/hreflang checks need ≥1 successfully-fetched HTML page. A genuinely blocked or fetch-failed crawl (`coverage: 'none'`) is withheld; everything else scores from whatever mix of applicable checks the evidence supports — a single clean HTML page can legitimately reach 100.
- **On-Page SEO** — per-page checks (title/meta/heading existence, length, genericness) are fully applicable on a SINGLE page. Only the cross-page comparison checks (duplicate title/description) require ≥2 eligible pages — with fewer, they correctly produce no finding (inapplicable, not a pass) rather than being treated as a reason to discount the rest of the pillar. A single genuinely well-formed page can reach 100; a single page with real defects scores exactly what those defects earn.
- **Site Architecture** — every check (orphan/underlinked/dead-end/redirect-edge/broken-edge) requires a real link GRAPH — at minimum 2 eligible pages with a relationship between them — to have anything applicable to evaluate at all. With fewer than 2, the pillar is WITHHELD (`not_analyzed`), because there is no applicable check left, not because the evidence is merely thin.
- **Content** — thin-content, structure, duplicate, and repetition checks are all fully applicable on any number of pages ≥1; a single substantive page earns a real score from real evidence. Thin content is not an evidence gap — it is directly observed, evidence-backed evidence of a real defect, and is scored by the deduction formula (with severity that escalates for extreme thinness — see `lib/content/checks/thin-content.ts`), never withheld or ceilinged separately.
- **Performance / Accessibility / Security** — each check is a per-page, static-HTML/HTTP observation, fully applicable with a single successfully-fetched page. A small, clean single page can legitimately score 100 on these pillars — see Sections 5-7 for what that 100 does and does not claim.

## 4. Overall Website Health

**Canonical function:** `computeOverallWebsiteHealth` in `lib/category-engine/overall-health.ts`.

There are exactly two states:

**COMPLETE** — every one of the seven canonical pillars is `status: 'analyzed'` with a numeric score AND reports `coverage: 'adequate'` (never `'low'`/`'none'`, and never a missing/null coverage value — a category that predates coverage reporting is treated as unknown confidence, never silently upgraded to sufficient). In this state, and only this state:

```
Overall Website Health =
  round(
    (TechnicalSEO + OnPageSEO + SiteArchitecture + Content +
     Performance + Accessibility + Security) / 7
  )
```

No weighting. No eighth pillar. No penalty beyond what each pillar already earned independently.

**WITHHELD** — anything less than all seven fully, adequately evidenced. `score` is `null`. There is no partial mean, no discounted number, no "Limited 91" — a customer-facing number that looks precise but is built from fewer than seven fully-supported pillars communicates more certainty than webioom possesses. `contributingCategoryCount`/`totalCanonicalCategories` are always returned as an internal diagnostic (used to explain *why* the score is withheld — "4 of 7 pillars have enough evidence so far") and are never displayed as though they were the score itself.

This superseded an earlier design (this same session, an intermediate pass) that displayed a raw partial-mean number next to a "Limited" badge. Audited in this pass and found insufficient: the NUMBER itself, not merely its label, was the overclaim.

## 5. Performance semantics

"Performance: 100" means: **the page webioom fetched had no detectable issues among the static, directly-measured signals this pillar actually checks** — response size, script/stylesheet counts, render-blocking script presence, image dimension/lazy-loading hints, and caching/compression headers.

It does **not** mean, and must never be read to imply: real browser load time, Largest Contentful Paint, Cumulative Layout Shift, Interaction to Next Paint, a Lighthouse score, or any CrUX field data. Webioom does not run a browser and does not measure real-world loading performance. This is now stated explicitly in the pillar's own report description (`app/dashboard/websites/[id]/performance/page.tsx`), matching the precedent already set by the Accessibility and Security pillars' own descriptions.

## 6. Accessibility semantics

"Accessibility: 100" means: **no defect among webioom's deterministic, static-markup checks was found** — missing image `alt`, missing `<html lang>`, unlabeled form inputs, links with no accessible name, duplicate element IDs, iframes with no title.

It does **not** mean, and must never be read to imply, WCAG conformance, keyboard-navigation correctness, color-contrast adequacy, or screen-reader usability — all of which require manual or dynamic testing this analyzer version does not perform. The pillar's own report description already states this explicitly and is unchanged by this pass.

## 7. Security semantics

"Security: 100" means: **no defect among webioom's publicly observable, static security-hygiene signals was found** — HTTPS usage, mixed content, insecure forms, and response security headers.

It does **not** mean, and must never be read to imply, that the site has no vulnerabilities, has been penetration-tested, or has been scanned for server-side, application-level, or dependency vulnerabilities. The pillar's own report description already states this explicitly and is unchanged by this pass.

## 8. Pillar independence

A pillar's score is judged ONLY by the evidence its own checks are responsible for. A thin Content pillar, an under-evidenced Site Architecture pillar, or any other pillar's insufficiency is never used as a reason to lower a DIFFERENT pillar's score. Technical SEO, Performance, Accessibility, and Security can all legitimately remain strong on a single clean page even when Content or Site Architecture cannot yet be scored at all — this is a deliberate, load-bearing property of the model, not an oversight to "fix" by cross-pillar punishment. The Overall Score's WITHHELD state (Section 4) is what prevents an incomplete assessment from reading as a confident verdict — never a fabricated penalty applied to an otherwise-clean pillar.

## 9. Positive evidence, not merely absence of findings

Where a check's own logic already distinguishes degrees of quality (not just pass/fail), that distinction is surfaced directly in the score rather than collapsed to a flat deduction:

- Content's thin-content check escalates severity for content under HALF a page-type's expected minimum, versus content that is merely somewhat short — a page with barely any content earns a materially lower score than one that just missed the bar, both fully traceable to the same underlying evidence (word count vs. a documented, page-type-aware threshold).
- The existing `adjustSeverity` widespread-escalation rule (unchanged by this pass, `lib/category-engine/severity.ts`) already means a defect affecting the majority of a site's analyzed pages is scored more severely than the identical defect affecting one isolated page — "how much of the site does this affect" is itself a form of positive/negative evidence weighting, not a separate concept bolted on.
- On-Page SEO's `weak_title` check is explicit, evidence-backed positive/negative signal about title QUALITY (not merely existence) — a generic placeholder title ("Home," "Untitled") is treated differently from a real, if imperfect, descriptive title.

This pass deliberately did not build a new, large "positive evidence" framework distinct from the existing findings/deduction model — every mechanism above reuses evidence and logic that already existed, recalibrated where the calibration itself was the defect (see Section 3's per-pillar minimum-evidence decisions and Section 1's contract for how "not enough evidence" and "confirmed clean" are now kept structurally distinct).

## 10. Historical scans and versioning

Each pillar persists its own `analyzer_version` string alongside every `crawl_analyses` row (already-existing infrastructure, not new to this pass), and the unified summary query resolves each pillar strictly by its CURRENT version constant. A stored row from an older version is simply invisible to that lookup — it resolves as `not_analyzed` until the customer re-runs analysis, never silently mixed with current-version rows in the same Overall Score.

This pass bumped exactly one version: `lib/content/types.ts`'s `ANALYZER_VERSION` from `content-v3` to `content-v4`, because the thin-content severity recalibration changes what health_score a fresh analysis computes for identical evidence, in the specific direction that matters (an old v3 score for a critically thin page could sit HIGHER than a v4 re-analysis would compute — the "stale score overstates quality" risk this contract exists to prevent). The evidence-ceiling removals (On-Page SEO, Technical SEO, Site Architecture) were deliberately left unversioned: they only ever RAISE what a fresh score can be relative to the old, removed ceiling, never lower it — an old, ceilinged score sitting at 84 when a fresh re-analysis would now score higher is an understatement, not a misleading overstatement, and does not carry the same risk this contract is designed against. Site Architecture's `not_analyzed` threshold change (extending withholding to `coverage.level === 'low'`) is a pure re-interpretation of already-persisted coverage data at DISPLAY time, not a recomputation — it applies immediately to historical rows without needing a version bump or a re-scan, since it corrects how an existing, unchanged fact is read, not what was computed.
