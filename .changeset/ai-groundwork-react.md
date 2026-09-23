---
'@intellectif/lk-react': major
---

AI help now reports what it cost and what was refused.

- **`ai-hint-shown` and `ai-explanation-shown` carry `usage`** when your port sent it, beside the
  `provenance` they already carried. What a learner was shown and what it cost are then one record,
  keyed to the attempt — no second channel to reconcile.
- **`ai-help-refused` is new**, from the same one implementation the components and the hooks share
  (`useAiHints`, `useAiExplanation`). It fires where a learner is told help is not available, with
  `feature` (`hint` or `explanation`), `reason` (`reveals-answer`, `contradicts-grade`, `malformed`,
  `empty`, `too-long`) and, for a hint, `hintNumber`. **The text is never carried:** a hint refused
  for revealing the answer contains the answer, and interactions are logged.

  A host that keeps every interaction will start seeing this kind. It is additive — nothing that
  was emitted before has changed — but a `switch` over `InteractionKind` with no default will not
  know it.

**Major** because the peer range moves to `@intellectif/lk-core@^0.19.0`, whose `ai-check` entry
point and `AiTextResult.usage` come with it. No React API was removed or renamed, and a host that
passes no AI port sees nothing new.

See `docs/ai.md`.
