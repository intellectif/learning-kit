# @intellectif/lk-react

## 2.1.0

### Minor Changes

- 69da998: Controlled components, render modes, redacted rendering and rich text — the release that lets an exam runner stop forking the SDK's components.

  **Fixed: `shuffleSeed` was missing from the published types.** It worked at runtime but the public `MultipleChoice` wrapper was typed with the base `ActivityProps`, so the declaration dropped it and TypeScript consumers could not pass it without a cast. The wrapper is now typed with `MultipleChoiceProps`.

  **Controlled components.** `value`, `defaultValue` and `onChange` on every activity, following the React convention: pass `value` + `onChange` to own the learner's answer — restore an in-progress attempt, autosave a delta, or drive a review. `defaultValue` seeds an uncontrolled mount. Passing neither reproduces the previous behaviour exactly.

  **`renderMode: 'practice' | 'exam' | 'review'`** (named `renderMode`, not `mode`, because `MultipleChoiceData.mode` already means single/multi select):

  - `practice` — the default and unchanged: the component scores locally, reveals correctness and feedback, emits xAPI, and calls `onComplete`.
  - `exam` — the component **never** scores, **never** reads or reveals an answer-key field, and does not call `onComplete` or emit xAPI (a `correctResponsesPattern` is the answer key). Submitting calls the new `onSubmit(response)` with the raw response so the server can grade it.
  - `review` — read-only, with no submit control. Correctness is marked **only** from a server-supplied `outcome: ItemOutcome`; the component never grades. A `deferred` outcome renders "not graded yet" rather than 0%, so an ungraded essay is never shown as a failure.

  **Components render redacted data.** `data` now accepts a `redact()` projection, so the same component serves practice and exam. Use the exported `asRenderable<TData>(redacted)` helper to bridge `RedactedActivityData` into the `data` prop without a cast at your call site. Wiring a redacted item into `practice` mode throws immediately with an explanatory error rather than failing later inside the submit handler.

  **Rich text, opt-in and fail-safe.** When you pass `sanitizeHtml`, `questionHtml` (multiple-choice) and `promptHtml` (written-response) render as HTML; without it, components render the escaped plain-text field as before. **The SDK ships no sanitiser on purpose** — that would be both a dependency and a false promise — so it can never inject HTML it was not explicitly handed a sanitiser for.

  _Known limitation:_ the fill-in-the-blanks `passageHtml` is deliberately **not** rendered. The passage is the container of the `{{id}}` inputs, so honouring it would mean slicing sanitised HTML at each placeholder and re-parsing the fragments — which both destroys the authored block structure and voids the sanitiser's guarantee (a placeholder inside an attribute splits mid-attribute). Rendering rich passages safely needs a structured passage format, planned for a later release; until then FIB renders the plain passage.

  New exports: `RenderMode`, `Renderable`, `HtmlSanitizer`, `asRenderable`, `MultipleChoiceProps`.

### Patch Changes

- Updated dependencies [69da998]
  - @intellectif/lk-core@0.3.1

## 2.0.0

### Minor Changes

- a98f128: v1.1.0 — written-response component plus verified bug fixes. Additive API; two behavioral fixes are flagged below.

  **New: `<WrittenResponse>`** (`@intellectif/lk-react/components/WrittenResponse`): labelled textarea with a live word counter and bounds messaging for asynchronously graded free writing. Completes via `onSubmitted(submission)` — `text`, `wordCount` (recomputed with `countWords`), `withinWordBounds`, `timeSpent`, and a SUBMITTED-verb xAPI statement with no score fields. Deliberately not `onComplete`: an ungraded submission never fabricates a score. Not yet dispatched inside `ActivitySequence` (its results contract is score-based; widening lands in v0.4) — a written-response item in a sequence renders an unsupported-type note.

  **New: `shuffleSeed` prop on `MultipleChoice`.** Supply a seed (e.g. the attempt id) to make the shuffled order reproducible server-side, stable across reloads, and SSR-hydration-safe. Without it, behavior is unchanged (random per-mount order).

  **Fixed:**

  - `ActivitySequence` now resets its position and results when the activity **set** changes (B8): previously results leaked across sets, `onComplete` could fire with a mixed old/new results array, a shorter new set stranded the learner on an empty view, and the unkeyed child kept stale answer state. The child is now keyed per slot. The reset keys on the ordered activity **ids**, not the array reference — parents that rebuild a structurally identical array on every render (inline literals, `.map()` in render) keep their in-progress state.
  - `crypto.randomUUID` is no longer called unconditionally on every `MultipleChoice` mount — it crashed on non-HTTPS origins (LAN/staging) even with shuffle off. It is now lazy (shuffle-without-seed only) with a non-crypto fallback.
  - The embed `<iframe>` now actually has the `sandbox` attribute its documentation always claimed (`allow-scripts allow-same-origin allow-presentation`); combined with lk-core's new URL scheme allow-list this closes a stored-XSS vector.
  - **Behavioral fix — `useXAPI` now applies the configured identity**: `XAPIConfig.actor` replaces the SDK's anonymous placeholder actor, and `XAPIConfig.activityId` replaces the SDK's `urn:learning-kit:activity:*` object id, before sending. This implements the contract that was documented but never wired (both config fields were dead). Conservative: statements whose actor/object id were already rewritten by the app are left untouched. If you relied on the anonymous actor reaching your LRS while also passing `actor` in config, statements will now carry the configured actor. A hook instance is per-activity by contract; for pages sending **several activities through one hook**, `activityId` now also accepts a mapper — `(sdkObjectId) => string` — so each question keeps a distinct IRI instead of collapsing onto one.
  - xAPI statements now include `definition.type` + `interactionType` (+ `correctResponsesPattern`/`choices` for multiple-choice), and name language maps use the activity's `locale` instead of hardcoding `en-US`.
  - Overall feedback is now taken from `ScoringResult.feedback` (selected by lk-core on `passed` — same visible behavior, one source of truth).
  - The skin honors `prefers-reduced-motion`, and ships `.lk-wr*` styles for the new component.

  **Packaging:** `engines.node >= 20`, LICENSE now ships in the tarball.

### Patch Changes

- Updated dependencies [a98f128]
  - @intellectif/lk-core@0.3.0

## 1.0.1

### Patch Changes

- ed4a77d: Add a per-package README so visitors to npmjs.com see a focused overview, install command, quick-start example, subpath-export map, and links to the full documentation. No runtime change.
- Updated dependencies [ed4a77d]
  - @intellectif/lk-core@0.2.1

## 1.0.0

### Minor Changes

- 9e24763: V1 feature set: Multiple Choice & Fill-in-the-Blanks activities, scoring engine,
  xAPI builder + `useXAPI`, `useActivityState`, `ThemeProvider` with an optional
  token-driven skin and `createTailwindTheme`, `ActivitySequence` question-set
  pager, optional per-activity `media` (image/audio/video/embed) and authored
  overall `feedback`, full WCAG 2.2 AA accessibility, and project documentation.

### Patch Changes

- Updated dependencies [9e24763]
  - @intellectif/lk-core@0.2.0
