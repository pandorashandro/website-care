# Category score quality standard (Phase 27 score-calibration audit)

This document defines the properties a canonical webioom category score MUST satisfy before it can be presented as an authoritative 0-100 health number. It is a **quality standard, not a shared formula** — Technical SEO and Site Architecture already use similar-shaped deduction models because that shape happens to fit both, but a future category (Performance, driven by measured Core Web Vitals; Accessibility, driven by a different violation taxonomy) may legitimately need a different formula. What must NOT differ is whether that formula satisfies every property below.

This standard exists because a real audit (this document's own origin) found that a scoring model can look reasonable in isolation and still systematically overestimate health for structural reasons — too few possible checks, occurrence-blindness, a severity signal that can't scale with its own evidence. Every future category engine should be checked against this list before its score is trusted.

## The ten properties

1. **Evidence-driven** — every point deducted must trace back to an observed fact in persisted evidence, never a guess, an assumption about business intent, or a subjective "quality" judgment.
2. **Deterministic** — identical evidence must always produce the identical score. No randomness, no wall-clock dependence, no ordering sensitivity.
3. **Explainable** — a support engineer (and eventually a customer) must be able to reconstruct exactly which findings caused which deductions from already-persisted data, without needing to reverse-engineer the formula from scratch. See `explainArchitectureHealth` in `lib/architecture/health.ts` for the reference shape: a pure function taking the same persisted finding fields and returning a per-finding deduction breakdown.
4. **Scope-aware** — a finding's impact on the score must reflect how much of the ANALYZED site it affects, as a fraction, never as an absolute count alone. An absolute-count-only model unfairly punishes small sites and lets large sites hide serious problems behind a low percentage.
5. **Severity-aware** — different underlying conditions must be able to cost different amounts, and a condition's severity must be allowed to escalate when the evidence genuinely supports a worse conclusion (e.g. an isolation ratio of 95% is not the same problem as one of 21%, even if both cross the same reporting threshold — a check whose severity is pinned to one fixed value regardless of how far past the threshold the evidence sits is under-calibrated).
6. **Proportional** — a single trivial issue must not collapse an otherwise healthy score, AND a genuinely severe, widespread condition must not be capped at a token deduction. Both failure directions are equally real risks; a model resistant to one but not the other is not proportional, it is just biased in one direction.
7. **Bounded** — the score must always land in [0, 100], with no code path capable of producing a value outside that range regardless of how much or how little evidence exists.
8. **Monotonic** — adding a genuine problem to otherwise-identical evidence must never increase the score; removing one must never decrease it. This is the single most mechanically checkable property (see the mutation-testing pattern in `tests/architecture-score-calibration.test.ts`) and the cheapest one to verify exhaustively.
9. **Calibrated against occurrence, not just presence** — a check whose deduction is identical whether it fires once or fires two hundred times has a real blind spot. The corrected number must be sensitive to genuine scale (a hub page with 200 broken links is worse than one with a single broken link) without being purely additive per-occurrence (200 broken links must not cost 200x a single one either — diminishing, capped scaling is the defensible middle ground; see this phase's `combinedSpread` correction in `lib/architecture/health.ts` for a worked implementation).
10. **Honest about incomplete evidence** — a score computed from a partial crawl must say so, must never silently extrapolate to imply full-site certainty, and any specific check whose conclusion cannot be responsibly drawn from incomplete evidence must be suppressed or explicitly downgraded rather than left to produce a false-confidence number.

## How to audit a category score against this standard

For every check the category implements, ask:

- Why should this condition affect this category's health at all? (Property 1)
- What is its severity, and is that severity fixed regardless of how extreme the underlying evidence gets, or can it escalate? Should it be able to? (Property 5)
- Does one occurrence of this condition affect the score differently from a hundred occurrences of the same condition? Should it? (Property 9)
- What is the theoretical MAXIMUM total deduction this category's scoring model can ever produce, given every check it currently implements firing simultaneously at maximum severity and scope? If that ceiling falls meaningfully short of enough to reach a low score, the model cannot honestly represent a severely unhealthy site regardless of how proportional each individual check's math is — this is a structural ceiling problem, not a per-check tuning problem, and it is exactly what a controlled "severely broken" calibration fixture (Property 8's monotonicity tests, run against synthetic worst-case evidence) is designed to catch.
- Does the check's suppression/confidence behavior under a PARTIAL analysis scope match what the evidence can actually support, on a check-by-check basis — never a blanket "trust everything" or "suppress everything" rule? (Property 10)

## What this standard deliberately does not mandate

- A single shared deduction formula across categories. Reuse the SHAPE where it genuinely fits (as Site Architecture did from Technical SEO), never blindly, and never merely for consistency's own sake.
- A specific severity/confidence/scope vocabulary implementation detail — only that whatever vocabulary a category uses lets the ten properties above be satisfied.
- Any particular numeric thresholds (tier caps, spread breakpoints, severity deduction weights) — those are calibration decisions specific to each category's own evidence, to be justified with the same controlled-fixture and mutation-testing discipline this document describes, not copied wholesale from another category without re-justifying them for the new evidence shape.
