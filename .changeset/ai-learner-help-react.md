---
'@intellectif/lk-react': major
---

Learners can ask an AI for help. "Explain my answer" appears under a graded answer, and "Get a hint"
before submit, in `<MultipleChoice>`, `<FillInTheBlanks>` and `<GapSelect>`. `<Dictation>` gets
explanations only; it has word hints of its own.

- **Your model, through ports you supply.** `<LkAiProvider ai={{ explain, hint, maxHints, learnerLocale }}>`
  (new subpath `@intellectif/lk-react/ai/LkAiProvider`, also on the root) supplies them. So does an
  `ai` prop on every activity, on `<ActivitySequence>` and on `<InteractiveVideo>`. A component's own
  `ai` wins over the provider's, whole. A question a host draws — a `renderers` override, or the video's
  `renderQuestion` (as the new `ai` field of `InteractiveVideoQuestion`) — is handed the ports in force,
  except in `exam`. Leave a port out and that help does not appear.
- **Where it appears:**
  - hints in `practice` before submit, up to `maxHints` (3 by default, at most 10), on a question that
    is not disabled;
  - an explanation in `practice` after submit, or in `review` when `outcome` is scored;
  - **nothing in `exam`**, whatever is passed;
  - nothing an item's author switched off with `ai: { hints: false }` or `ai: { explanations: false }`.
- **What a learner sees is checked first.** A hint containing the answer, an explanation of a verdict
  other than the SDK's, and malformed, empty or over-long text are all refused. The learner sees "not
  available" and can ask again, and a development build logs the reason. A refused hint is not
  counted.
- **Everything a model wrote is marked:** "Written by AI. It can make mistakes."
- **A call only when the learner presses a button**, with an `AbortSignal` that fires when the answer
  it was about goes away. A late answer is dropped either way, and a failure never blocks the
  question.
- **For accessibility:** focus moves to an explanation when it arrives, and the buttons stay focusable
  while working (`aria-busy`, `aria-disabled`).
- **Records:** `ai-hint-shown` and `ai-explanation-shown` reach `onInteraction`, each with the port's
  `provenance`.
- **Styling and strings:** eleven new strings (`aiExplain` … `aiNotice`, all in `docs/i18n.md`) and
  `.lk-ai-*` classes in the optional skin.

**Major** because the peer range moves to `@intellectif/lk-core@^0.17.0`, whose `ai` field can
refuse stored content (see its changelog). A host that passes no AI port sees nothing new.

See `docs/ai.md`.
