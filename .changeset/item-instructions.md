---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

**A question's own instructions**: multiple choice, fill in the blanks and gap select take an optional `instructions`, the task the learner reads before answering, as read aloud already does.

**Action required:** none, unless you already store a field under this name. Content is loose, so an `instructions` of your own on these three types validated before. It now has to be a string, and on a fill in the blanks or a gap select it may hold no `{{id}}` placeholder. Anything else fails validation at `instructions`. **No grade changes:** no scorer reads it, and the grade-stability corpus is unchanged.

- **What it is for:** "Complete the sentence. Use ONE word.", on a question served alone (an adaptive test's, or a bank shuffled across forms) where no item group can hold it. Instructions a run of questions shares stay in the group's text stimulus.
- **lk-core:**
  - **The field.** `instructions?: string` on `MultipleChoiceData`, `FillInTheBlanksData` and `GapSelectData`, plain text. A `{{id}}` placeholder in a fill in the blanks' or a gap select's instructions is refused at `instructions`, since blanks and gaps live in the passage only.
  - **Learner-visible.** `redact()` keeps it at every reveal level, and so do `withoutAuthorOnly()` and `redactItemGroup()`. `assertRedacted()` accepts it, and the `Redacted*` types carry it.
  - **Schemas.** `jsonSchemaFor()` and `contentJsonSchema()` describe it.
  - **AI help.** Hint and explanation facts carry `instructions` on these types, trimmed, apart from the question or the passage. A grouped question carries both its group's `material` and its own instructions. Tell your model that they are the task, not part of the text answered.
  - **Drafts.** A model drafting these types may write `instructions`, and `checkAiDrafts` keeps them.
  - **`@intellectif/lk-core/ai-check`** has one more case, `fib-instructions-hint`: the word-formation blank of `fib-formation-hint` served alone, with its task in its own instructions.
- **lk-react:** `<MultipleChoice>`, `<FillInTheBlanks>` and `<GapSelect>` draw the instructions first, before the media and the question or passage, in `.lk-mc-instructions`, `.lk-fib-instructions` or `.lk-gs-instructions`. The question's fieldset names them with `aria-describedby`. Blank instructions draw nothing. Inside `<ActivitySequence>`, a grouped question shows its group's material, then its own instructions. lk-react 23.3.0 peers on lk-core `^1.7.0`, so upgrade the two together.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md#a-questions-own-instructions-17
