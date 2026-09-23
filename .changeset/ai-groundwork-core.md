---
'@intellectif/lk-core': minor
---

Groundwork under the AI line: what a call cost, what was refused, and a way to test a prompt.

- **`AiTextResult.usage`** — what the call cost, as your provider reported it to your port. It is the
  same `GraderUsage` a returned grade already carries (`promptTokens`, `completionTokens`, `costUsd`),
  so one shape covers help for a learner and marking by a grader. The SDK never estimates it and never
  adds it up; it carries what you send, and drops a number that is not finite and zero or more rather
  than let it into your totals.
- **`ai-help-refused`** joins the interaction kinds: a host can now see, in production, that its model
  wrote a hint containing the answer or an explanation of a verdict the SDK did not reach. The
  development console warning said it only to a developer. The event carries the feature and the
  reason and **never the text** — the text of a refused hint is the answer.
- **`@intellectif/lk-core/ai-check`, a new entry point: a test kit for your prompts.** `runAiCheck`
  makes the calls a learner's questions would make — on items whose answers the SDK knows — and runs
  the same checks it runs before a learner sees anything, reporting what would have been shown and
  what would have been refused, with the reason. `aiCheckCases` hands over the cases (every type it
  explains, answered right, wrong and partly right; every type it hints for, before an answer and
  after a wrong one), and takes cases of your own built on your own items. `formatAiCheckReport`
  prints a run for a CI log.

  It is a separate entry point because it is for your test run, not a learner's browser: nothing a
  page renders imports it.

The empty `@intellectif/lk-ai` placeholder has been deleted — it never held code, and the ports it
was planned for live here, beside the scorers whose readings the checks are.

See `docs/ai.md`.
