---
'@intellectif/lk-react': major
'@intellectif/lk-core': patch
---

`<GapSelect>` — the renderer the dropdown cloze shipped without.

`lk-core@0.10.0` registered `gap-select` and `lk-react` had no branch for it. An authored item validated, scored and redacted perfectly, and rendered "This activity type has no renderer" — and `GapSelectData` was not exported from lk-core's public barrel, so a consumer could not even name the type to write a renderer of their own. Both are closed here.

**`<GapSelect>`**, also at `@intellectif/lk-react/components/GapSelect`: a selector per `{{id}}` gap, the passage flowing around them. It carries the same contract as the other three built-ins — `value`/`defaultValue`/`onChange`, `practice | exam | review`, `defaultSubmitted`, `outcome`, dev-only boundary validation, reset-on-`data`-change, per-gap marking and authored feedback with a show/hide toggle, and the same render-time refusal of redacted data in `practice` that `<MultipleChoice>` and `<FillInTheBlanks>` make.

**The empty first entry is behaviour, not chrome.** It is how a learner leaves a gap alone and how they take an answer back, so an unanswered gap stays distinguishable from a wrong one: the scorer reports `incorrect-omission` and nothing downstream has to guess.

`shuffleChoices` is seeded **per gap**, not once per activity — two gaps drawing on one word bank must not be dealt the same order, or the bank's distractors line up column-wise and the second gap is easier than the first. `<ActivitySequence>`'s seed guard now counts `shuffleChoices` alongside `MultipleChoiceData.shuffle`, so an exam that shuffles without a `shuffleSeed` still throws at render.

Dispatch is wired in `<ActivitySequence>` and `<ActivityPreview>`, and a test renders a gap-select item through the sequence and asserts the unsupported notice is not what comes back — the gate that was missing when the type shipped half-built.

`LkStrings` gains `gapLabel(ordinal)` and `gapPlaceholder`. A dictionary declared as a complete `LkStrings` must add both; partial overrides are unaffected.

lk-core's patch is the public type export (`GapSelectData`, `GapSelectGap`, `GapSelectBank`, `GapSelectChoice`, `GapSelectLearnerResponse`) — no behaviour changes.
