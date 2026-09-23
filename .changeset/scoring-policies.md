---
'@intellectif/lk-core': minor
'@intellectif/lk-react': major
---

**Scoring policies**: "Try again" in practice, which try counts, and what tries and hints cost — set per paper, recorded in the plan, and no grade moves without one.

**Action required:** only if you build an `InteractiveVideoQuestion` by hand (add `scoring`, e.g. `DEFAULT_ITEM_SCORING_POLICY`) or implement a complete `LkStrings` of your own (nine new keys). Everyone else upgrades with no change.

- **lk-core:** `ItemScoringPolicy` — `retries` (0–10), `counts` (`'first'` by default, `'best'`, `'last'`), `retryPenalty` and `hintPenalty` (fractions of the marks). `scoreTries` does the arithmetic: a cost is subtracted, never below zero, with floating-point residue under a pass line removed. `evaluate(item, response, { scoring })` charges the response's hints; `evaluateTries(item, responses, { scoring })` picks the try that counts. `validateItemScoringPolicy` and `resolveItemScoringPolicy` refuse a policy that cannot be applied — a `RangeError`, never a guess. `planAttempt(…, { scoring })` records it in the plan and `planHash`, and `verifyAttemptPlan` reports `scoringChanged`. With no policy every number is what it was; 43 new grade vectors pin the arithmetic.
- **Responses:** multiple-choice, fill-in-the-blanks and gap-select responses gain an optional `hintsRevealed`, as dictation's already had: in `practice`, the hints a learner was shown, counted from the start of the question.
- **lk-react:** `scoring` on every activity, `<ActivitySequence>` and `<InteractiveVideo>`; the paper's policy wins over a question's. "Try again" after an answer short of full marks keeps the answer and clears the marks; "Show answer" (or "Keep this answer") ends the tries. While a try is on offer the right answer and "Explain my answer" wait. `onComplete` fires after every try with the question's score so far. A set waits for any question being tried again, and for the question on screen while it offers a try, and closes every question's tries once it reports; the video closes them at Finish.
- **Fixed:** a dictation under `delivery={{ solutions: false }}` hid "Show solution" but its marks still named every word they corrected. They now say a word is wrong or missing without naming it, and draw no letter diff.
- Nine new strings: `tryAgain`, `showAnswer`, `keepAnswer`, `triesLeft`, `countedTry`, `scoreBeforeCosts`, `hintCost`, `dictationWordWrongUnnamed`, `dictationWordMissingUnnamed`.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/scoring.md
