---
'@intellectif/lk-core': minor
---

Sectioned assessment scoring, with rounding treated as the two distinct operations it actually is.

**`composeAssessmentScore(sections, policy)`** turns per-item outcomes into a weighted, sectioned grade: normalised section weights, per-section thresholds with per-section overrides, per-item `points`, and an explicit `passFailureReason` (`overall_below_threshold` | `section_below_threshold` | `both` | `null`).

This exists because the formula is invariably written twice — once on the server that records the grade, once on the client that shows the learner their breakdown — and the two drift, usually on the scale (0–1 vs 0–100) or on whether a section override is honoured.

**Ungraded work never counts as zero — and the two reasons for it are kept apart.** `deferred` items (a grade is coming) are excluded from the denominator, reported in `pendingSlotIds`, and hold the result at `status: 'provisional'`. `unscorable` items (a grade is never coming — an unregistered type, redacted data) are excluded from the denominator too, but reported separately in `unscorableSlotIds` and they do **not** hold the result provisional: `evaluate()` returns that status precisely so a mixed-version content bank does not crash an exam, and such an attempt still has to be recordable.

`passed` and `passFailureReason` are also `null` when **nothing was gradable at all** — every item unscorable, or an empty assessment. There is no evidence either way, and a hard `false` would record a fail at 0% for a learner whose work was never gradable. While the result is `provisional`, they are likewise `null` rather than `false` — an attempt with unmarked work has neither passed nor failed, and returning `false` would let a UI keyed on `passed` show a fail for an essay nobody has looked at. Crucially, a section with nothing graded yet does not drag the total down: the weighted total is computed over the sections that *have* something graded, with their weights renormalised among themselves. `SectionScore.normalizedWeight` reports that **live** weight (0 for a section contributing nothing), so a client can rebuild the grade from `sections[]` and agree with the record: `roundGrade(sum(section.score * section.normalizedWeight), rounding) === result.score`, exactly, by construction. Apply the same final rounding — the raw weighted sum of already-rounded section scores is not itself a rounded value (0.85 and 1.00 at equal weights sum to 0.925 against a recorded 0.93), so comparing it unrounded is off by up to half a quantum. The authored weight is still reported verbatim as `weight`. Without that, a midterm containing an unmarked essay reads as a failing 50% — a learner shown a fail for work nobody has looked at yet. A section with nothing graded is likewise never reported as having failed its threshold.

**Items are keyed on `slotId`, not activity id.** The same activity can legitimately appear in two sections; keying on the activity collapses them into one and silently scores the second occurrence as zero.

**`RoundingPolicy` — required, with no default, ever.** Rounding is two operations that must not share one policy:

- **Grade rounding** (`roundGrade`) decides the number a learner is shown and recorded against. `dp` is required and load-bearing: at 2 decimal places a learner shown "70%" is not recorded as a fail at 69.6.
- **Band classification** (`classifyBand`) deliberately **floors**, because over-placement is the more harmful error, so a boundary is never reached by rounding up.

Supplying a single default would silently invert one of them, so the SDK supplies neither.

`roundGrade` also guards binary float noise with a sign-aware epsilon — `1.005 * 100` is `100.49999999999999`, which would otherwise round down and cost a learner a grade step. **`gte(value, threshold, policy)`** rounds *both* sides before comparing, so "what the learner sees" and "what the gradebook decides" are the same comparison. Modes: `half-up`, `half-even`, `floor`, `ceil`.

`roundGrade` is **idempotent** for every mode: the float-noise allowance is applied in the direction each mode needs (`ceil` nudges down, `floor` nudges up, half modes nudge away from zero), so a value already exact at `dp` is never moved. A uniform away-from-zero nudge would make `ceil` climb a whole step each call — 0.7 to 0.71 to 0.72, and a true zero to 0.01 — which matters because a composed score is rounded once and then compared through `gte`, which rounds again.
