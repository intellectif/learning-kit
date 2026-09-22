---
'@intellectif/lk-core': minor
---

The contract for AI help a learner reads — an explanation of a graded answer, and hints before one —
between an activity and a model the host runs. The SDK never calls a model and holds no key or prompt;
it builds what the model is given and checks what comes back.

- **Facts:** `buildAiFacts(data, response, details)` describes an item as the learner saw it, their
  answer, and the SDK's own verdict part by part. It covers multiple choice (every option), fill in the
  blanks and gap select (each blank or gap in passage order, the passage written with `[1]`, `[2]`…),
  and dictation (the word-by-word alignment). On a redacted item the key is absent, except where a
  server's outcome supplies it.
- **Requests:**
  - `aiExplanationRequest({ data, response, outcome?, learnerLocale? })` carries the facts and the
    `grade`, with its `category` (`correct`, `partly-correct` or `incorrect`). A scored `outcome` wins
    over grading locally, so an explanation speaks to the grade of record.
  - `aiHintRequest({ data, response, previousHints, learnerLocale? })` carries the key and the answer
    so far, marked part by part. It gives none for a dictation, which has hints of its own, or for a
    redacted item.
- **Checks:**
  - `readAiTextResult` refuses anything but plain text of up to 2,000 characters (`malformed`,
    `empty`, `too-long`), with control characters removed.
  - `checkAiExplanation` also refuses an explanation stating a verdict other than the SDK's
    (`contradicts-grade`).
  - `checkAiHint` also refuses a hint that contains an answer (`reveals-answer`).
- **The guard:** `hintRevealsAnswer(facts, text)` finds an answer written out, ignoring case,
  accents and punctuation. An answer of one short word counts only where the hint writes it beside a
  neighbour it has in the passage, so a hint can still say "the verb is…".
- **Permissions:** `aiSupports(type, feature)`, `aiAllowedByContent(data, feature)`, `aiGradeOf`, and
  the types `AiItemFacts`, `AiExplanationRequest`, `AiHintRequest`, `AiTextResult`, `AiProvenance`,
  `ActivityAiPermissions` and more. Two new interaction kinds: `ai-hint-shown` and
  `ai-explanation-shown`.

**The author's switch, and one tightened rule.** Every built-in type now defines an optional
`ai: { hints?: boolean, explanations?: boolean }`: `false` switches that help off for the item,
wherever it is delivered, and an author can only switch help off. `redact()` keeps both flags, as
public, and drops any other key inside `ai`; the strict redacted schemas accept them.

A field named `ai` was until now an unknown key the loose schemas kept, whatever it held. A sidecar
such as `ai: 'generated'`, or a flag that is not a boolean, now fails `validateActivity`: check stored
content before upgrading.

See `docs/ai.md`.
