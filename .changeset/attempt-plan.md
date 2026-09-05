---
'@intellectif/lk-core': minor
---

`planAttempt` — freeze what an attempt was served, so a grade stays defensible.

A sequence definition is live content: it gets edited, re-ordered, corrected. An attempt is a historical fact. Until now nothing pinned the two together, and three separately-found defects all traced back to the same missing primitive — `composeAssessmentScore` **required** a stable `slotId` while the only producer of one was positional.

**`planAttempt(entries, { seed, shuffleEntries, points })` → `AttemptPlan`.** Called once when the attempt starts and stored beside the responses. It freezes the presented order, each slot's identity and worth, and a fingerprint of the content behind it. Ordering comes from `flattenSequence`, so a plan and a live render with the same seed agree slot for slot.

**Points belong to the paper, not the item.** The same question is worth 1 in a practice quiz and 3 in a final, so they are resolved once by a `points` callback and frozen — never read back out of content. A slot resolving to a negative or non-finite value is refused rather than allowed to poison the total.

**`slotKey` — identity that survives editing.** A positional slot id is only valid against one version of the entries array: insert a question at the top of a published paper and every id beneath it shifts, so rows stored as `"3"` silently start naming a different question. An entry (or an item inside a group) may now declare `slotKey`, used verbatim in place of the positional path. Two entries colliding on one is an error, not a merge — responses stored against a shared identity could not be told apart. A key containing `.` is refused, since that separates a group from its item.

**`verifyAttemptPlan(stored, current)`.** Ids survive an edit unchanged, so they cannot answer the question a remark or an appeal actually asks: *is this the paper the learner sat?* Re-plan the current entries with the options the stored plan recorded — its `seed`, its `shuffleEntries`, the same `points` function — and this reports which items were edited, which stimuli were corrected, which were reweighted, what is missing, what was added, and what moved. Drift is not automatically a problem — a fixed typo changes a fingerprint without changing what was asked — but it is a fact somebody has to be able to see.

**`scoredItemsFromPlan(plan, outcomesBySlotId, { missing })`.** Builds `composeAssessmentScore`'s input from the plan, so the denominator is the paper rather than whatever happened to be answered — building that list from the answers instead is how a paper silently shrinks and the remaining questions become worth more than the exam says. How an unanswered slot is filled is a decision with teeth; see below.

**`contentHash` / `canonicalJson` / `fingerprint`** are exported for content fingerprinting generally. Canonical JSON sorts object keys (so a round-trip through a different serializer is not a false alarm), keeps array order, and distinguishes the non-finite numbers `JSON.stringify` collapses to `null`. The hash is deterministic and dependency-free, and is documented for what it is: change detection, not a tamper-evident signature.

**A missing outcome is `deferred`, never `unscorable`.** The two are not interchangeable: `unscorable` means "a grade is never coming", so `composeAssessmentScore` drops the slot from the denominator *and* lets the result go `final`. A three-question paper with one answer therefore composed to a final, passing 100% — the exact failure this helper exists to prevent. It now defaults to `deferred`, which holds the result `provisional` so nothing can be recorded, with `{ missing: 'zero' }` for a submitted paper whose blanks are genuinely blanks and a callback for anything else. `ItemOutcome`'s deferred `reason` gains `no_response_recorded`, because reusing `requires_async_grading` for an unanswered question would have been a lie.

**`slotKey` survives redaction.** `redact()` is fail-closed, so an unclassified field is dropped — which silently stripped the very identity a plan and a live render must share. An exam client rendering a redacted paper derived positional ids while the server's stored plan held keyed ones, and the responses could not be matched back. It is now classified `public` assembly metadata on every built-in policy and on the group, and accepted by the strict redacted schemas.

**`flattenSequence` refuses two entries sharing an entry key**, not just two sharing a full slot id. A loose activity keyed `"reading"` and a group keyed `"reading"` produce `"reading"` and `"reading.0"`, which never collide — while everything that reads the entry a slot belongs to, including the pager's stimulus grouping, treats them as one entry and shows the group's passage above the unrelated question.

**`verifyAttemptPlan` reports a reweight** (`changedPointsSlotIds`). Points decide the grade, so changing them changes the paper without touching a question; leaving it out meant `matches: true` while `planHash` disagreed. **`AttemptPlan` records `shuffleEntries`** so a shuffled attempt can actually be rebuilt — the documented re-plan omitted it, returned authored order, and reported unchanged content as fully re-ordered. And **`slotKey` is excluded from `contentHash`**, so annotating an item with the key that pins its identity is no longer reported as "this question was edited".

`flattenSequence` also now refuses duplicate slot ids, which were previously impossible by construction and become possible the moment keys are authored.
