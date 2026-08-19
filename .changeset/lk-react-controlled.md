---
'@intellectif/lk-react': minor
---

Controlled components, render modes, redacted rendering and rich text — the release that lets an exam runner stop forking the SDK's components.

**Fixed: `shuffleSeed` was missing from the published types.** It worked at runtime but the public `MultipleChoice` wrapper was typed with the base `ActivityProps`, so the declaration dropped it and TypeScript consumers could not pass it without a cast. The wrapper is now typed with `MultipleChoiceProps`.

**Controlled components.** `value`, `defaultValue` and `onChange` on every activity, following the React convention: pass `value` + `onChange` to own the learner's answer — restore an in-progress attempt, autosave a delta, or drive a review. `defaultValue` seeds an uncontrolled mount. Passing neither reproduces the previous behaviour exactly.

**`renderMode: 'practice' | 'exam' | 'review'`** (named `renderMode`, not `mode`, because `MultipleChoiceData.mode` already means single/multi select):

- `practice` — the default and unchanged: the component scores locally, reveals correctness and feedback, emits xAPI, and calls `onComplete`.
- `exam` — the component **never** scores, **never** reads or reveals an answer-key field, and does not call `onComplete` or emit xAPI (a `correctResponsesPattern` is the answer key). Submitting calls the new `onSubmit(response)` with the raw response so the server can grade it.
- `review` — read-only, with no submit control. Correctness is marked **only** from a server-supplied `outcome: ItemOutcome`; the component never grades. A `deferred` outcome renders "not graded yet" rather than 0%, so an ungraded essay is never shown as a failure.

**Components render redacted data.** `data` now accepts a `redact()` projection, so the same component serves practice and exam. Use the exported `asRenderable<TData>(redacted)` helper to bridge `RedactedActivityData` into the `data` prop without a cast at your call site. Wiring a redacted item into `practice` mode throws immediately with an explanatory error rather than failing later inside the submit handler.

**Rich text, opt-in and fail-safe.** When you pass `sanitizeHtml`, `questionHtml` (multiple-choice) and `promptHtml` (written-response) render as HTML; without it, components render the escaped plain-text field as before. **The SDK ships no sanitiser on purpose** — that would be both a dependency and a false promise — so it can never inject HTML it was not explicitly handed a sanitiser for.

*Known limitation:* the fill-in-the-blanks `passageHtml` is deliberately **not** rendered. The passage is the container of the `{{id}}` inputs, so honouring it would mean slicing sanitised HTML at each placeholder and re-parsing the fragments — which both destroys the authored block structure and voids the sanitiser's guarantee (a placeholder inside an attribute splits mid-attribute). Rendering rich passages safely needs a structured passage format, planned for a later release; until then FIB renders the plain passage.

New exports: `RenderMode`, `Renderable`, `HtmlSanitizer`, `asRenderable`, `MultipleChoiceProps`.
