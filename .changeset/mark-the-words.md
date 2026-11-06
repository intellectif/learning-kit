---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

**Mark the Words: the learner marks the words a task asks for in a text — every past-tense verb, the linkers — with `<MarkTheWords>` to draw it**

**Action required:** none for content and grades. Install lk-core 1.14.0 with lk-react 23.11.0. **No grade changes:** every stored grade and validation result replays as before. Type-level additions: `mark-the-words` joins `BUILT_IN_ACTIVITY_TYPES` and `INTERACTIVE_VIDEO_ITEM_TYPES`, and `RedactedMarkTheWordsData` joins `RedactedActivity`, so a `switch` or `Record` exhaustive over one of them needs an entry. A host that registered its own `mark-the-words` type must rename it.

- **lk-core:** the `mark-the-words` activity type — `MarkTheWordsData` with a `text` and `targets`, each a quote of one or more words with an `occurrence` where the words repeat. Words are cut by the SDK's own `lk-words@1` (`markableWords`), the same in every runtime, and a response names marked words by position (`marked`). A target counts when all its words are marked; each wrong mark costs a target's worth, never below 0. Redaction keeps the text and removes the targets entirely. Draft checks under `mw_*` codes, three critic findings (`mw_targets_dense` warns when marking every word would score), the xAPI `choice` interaction, `markTheWordsFromMarkup` for starred text such as H5P's, and frozen grade and validation vectors. A video quiz may hold one.
- **lk-react:** `<MarkTheWords>` (also `@intellectif/lk-react/components/MarkTheWords`): the text as written, each word an option of a multi-select listbox with one tab stop — arrow keys, Home and End move, Space or Enter marks. After a check each word is marked right, wrong, or missed where the delivery policy shows answers, in its name as well as its colour. `<ActivitySequence>`, `<ActivityPreview>` and `<InteractiveVideo>` draw it. New strings: `markWordsLabel`, `markCount`, `markCorrect`, `markWrong`, `markMissed`. New class hooks: `.lk-mw` and its parts. See https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md#mark-the-words--select-the-words-a-task-asks-for-114
- Not yet: AI explanations, hints, drafts and variants for a mark-the-words item.
