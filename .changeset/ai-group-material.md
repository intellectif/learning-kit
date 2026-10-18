---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

**AI help reads a question's group**: hints, explanations and feedback on writing now carry the passage, or the shared instructions, a grouped question is read beside.

**Action required:** none. Requests gain an optional `material`, which your prompt uses once you tell it to. A port that sends the whole request to its model sends the material too: up to 12,000 code points more per call on a question in a group.

- **lk-core:** `aiExplanationRequest`, `aiHintRequest` and `aiWritingFeedbackRequest` take an optional `group` (an `ItemGroup`, a redacted one, or your own `{ title, stimulus }`) and add `material`: the kind, the title, the text, the media type and its alt text, the attribution and the language. The text is cut past `AI_MATERIAL_MAX_LENGTH` (12,000 code points), at a word boundary, and marked `truncated`. The author's transcript and media addresses never go, so a whole group and a redacted one give the same material. The checks are unchanged: a hint that quotes the passage where it prints the answer is refused like any other.
- **lk-react:** inside `<ActivitySequence>` and `<InteractiveVideo>`, the SDK's own components, and a question you draw with `useAiHints`, `useAiExplanation` or `useAiWritingFeedback`, send their group's material by themselves. Outside a pager, pass `group` to the hooks. lk-react 23.2.0 peers on lk-core `^1.4.0`, so upgrade the two together. Coaching on a reading is unchanged.
- **`@intellectif/lk-core/ai-check`** has four more cases in item groups: a reading question explained, and hinted at, from a passage that prints its answer; a word-formation blank under its group's instructions; and a summary of the passage.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/ai.md#a-question-in-an-item-group-140
