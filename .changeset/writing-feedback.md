---
'@intellectif/lk-core': minor
'@intellectif/lk-react': major
---

**Feedback on writing**: "Get feedback on my draft" on a written response in practice. The learner revises and asks again, and every correction must quote what they wrote.

**Action required:** none unless your code switches exhaustively over `AiFeature` or `AiRefusal` (new members `'writing-feedback'` and `'misquotes-answer'`), reads `AiCheckCase.request` without narrowing on `feature`, or implements a complete `LkStrings` (eight new keys). Nothing changes until you pass a `writingFeedback` port. Otherwise this is a major only because the peer range moves to `@intellectif/lk-core@^0.22.0`.

- **lk-core:** `aiWritingFeedbackRequest` builds what a model is given: the task, the draft verbatim, its word count as the grader counts it, the rubric, and the feedback on earlier drafts. `checkAiWritingFeedback` checks the reply before a learner sees it. It finds each correction's quote in the draft itself (typographic quotes and runs of whitespace folded, case kept) and anchors it there. A correction of words the draft does not contain refuses the whole reply as `misquotes-answer`. Criteria must be the rubric's; the author's weights are attached, and a model's weight is ignored. The indicative score is `gradeFromRubric`'s total, computed only when every criterion was judged. It is never a grade. Limits: 20 corrections, 500 characters a field.
- **lk-react:** a `writingFeedback` port and `maxWritingFeedback` (3 by default, at most 10) on `LearnerAi`. `<WrittenResponse>` shows the feedback with its corrections, rubric comments, the indicative score marked "Not a grade." and the AI notice, and says so once the draft has changed. It is never in `exam` or `review`, and it follows the author's and the paper's `ai.explanations`, `feedback` and `solutions`. `useAiWritingFeedback` gives a written response you draw yourself the same rules.
- **Records:** `ai-writing-feedback-shown` (the draft number, how many corrections, the indicative score, provenance and usage; never the text), and `ai-help-refused` with `feature: 'writing-feedback'`.
- **ai-check:** a `writingFeedback` port runs four writing cases: a draft with mistakes, one without, a revision, and feedback asked for in Spanish.
- Eight new strings: `aiWritingFeedback`, `aiWritingFeedbackLoading`, `aiWritingFeedbackHeading`, `aiWritingFeedbackUnavailable`, `aiNoMoreWritingFeedback`, `aiWritingFeedbackOutdated`, `aiCorrections`, `aiIndicativeScore`.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/ai.md#feedback-on-writing
