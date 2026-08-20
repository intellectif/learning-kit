# @intellectif/lk-react

## 3.0.0

### Minor Changes

- d08a518: The return trip for deferred grading: a grade that arrives later is now a first-class SDK value.

  `evaluate()` could already say a submission was `deferred` — graded later by an AI or a human — but there was no type for the grade that comes **back**, so every consumer invented one and mirrored it by hand into their frontend. That gap is closed.

  **New in `lk-core`:**

  - **`GradeRecord`** — a scaled score, pass state and narrative feedback, plus the parts a rubric grader actually produces: `criteria` (per-criterion score or ordinal `band`, with comments and the weight applied), `corrections` (anchored in the learner's own text, with optional character offsets), `evidence`, `rationale`, `confidence`, `requiresHumanReview`, `grader` provenance (`kind`, `model`, `promptHash`) and token/cost `usage`. The shapes are the intersection of two independent production graders that converged on the same envelope.
  - **`ItemOutcome` gains a `graded` arm** carrying the record, with `score` / `maxScore` / `passed` / `feedback` mirrored onto the outcome for uniform reads. `scored` continues to mean "the SDK computed this deterministically"; `graded` means "a grader returned it".
  - **`gradeFromRubric(criteria, activity?, options?)`** — the weighted total as a **pure function of the grader's judgements**. A grader is asked for judgement, not mental arithmetic: if the model also returns the total, the grade becomes unverifiable and irreproducible, since two runs can disagree for identical criterion scores. Weights are normalised by their sum, so they need not add to 1. Criteria marked `notApplicable`, and band-only criteria with no numeric score, are excluded from **both** numerator and denominator. When nothing scoreable remains it returns `{ unscorable: true, reason }` — never a zero.

    It also refuses out-of-contract input rather than turning it into a grade: a criterion whose score is `NaN` or infinite is **rejected, not silently dropped** (dropping it would regrade the learner on fewer criteria, with different effective weights, and nobody would know), and a score outside the scaled `[0,1]` range — a grader reporting raw points such as 4-out-of-5 — is rejected by name instead of being clamped, because silently rescaling someone's grader is worse than telling them it is out of contract. Float noise a hair outside the range is clamped.

  - **`outcomeFromGrade(grade)`** and **`hasGrade(outcome)`**. Use `hasGrade` instead of testing `status === 'scored'`, which silently misses asynchronously graded work.
  - **`XAPIVerb.SCORED`** for "a grade now exists", distinct from `answered` (which asserts the grade existed at submission time — here the learner acted earlier and the grade arrived later, often from a different actor).

  **New in `lk-react`:** `<WrittenResponse renderMode="review" outcome={…} />` renders a returned grade — the percentage and pass state, narrative feedback, every criterion with its score or band and comment, inline corrections shown as `<del>`/`<ins>` pairs with explanations, and an awaiting-review affordance when `requiresHumanReview` is set. `notApplicable` criteria render as such rather than as zeros, and a `deferred` outcome still renders "not graded yet" rather than 0%.

  Additive: `ItemOutcome` gained a union member, so an exhaustive `switch` over outcome statuses will need the new `graded` case.

- 2b1acbf: `ActivitySequence` gains a renderer registry and can finally run mixed sets containing a written response.

  **Fixes a real defect:** a set mixing graded activities with a written response could **never complete**. The essay slot rendered a dead-end "not supported" note, so `onComplete` never fired — and any "section submitted / persist attempt / award XP" logic hanging off it silently never ran. Written responses are now dispatched to the real `<WrittenResponse>`.

  **New `onFinished(items)`** — the general completion signal, reporting a `SequenceItemOutcome` per slot:

  ```ts
  type SequenceItemOutcome =
    | {
        kind: "scored";
        index: number;
        activityId: string;
        result: ActivityResult;
      }
    | {
        kind: "submitted";
        index: number;
        activityId: string;
        submission: WrittenResponseSubmission;
      };
  ```

  Two kinds, because two kinds of activity exist: those the SDK scores at submit time, and those a grader scores later. Collapsing them would mean inventing a score for ungraded work.

  `onComplete` is unchanged and still promises `ActivityResult[]`, so it now fires **only when every slot was scored** — it cannot fire for a set containing a written response, because there is no honest `ActivityResult` to supply. Existing all-graded sequences behave exactly as before; use `onFinished` for mixed sets.

  **New `renderers` prop — the React half of the activity-type registry.** `registerActivityType` already let a consumer define a custom type in `lk-core`; there was no way to put it on screen, so the type system was open in core and closed in React (original Requirement 15.4–15.6). Now:

  ```tsx
  <ActivitySequence activities={items} renderers={{ matching: MatchingItem }} />
  ```

  Renderers are keyed by `data.type` and receive the standard `ActivityProps`. A key matching a built-in **overrides** it, so a consumer can replace the bundled multiple-choice renderer without forking the sequencer. An unknown type with no registered renderer still degrades to an accessible note rather than crashing.

  **New `renderMode` prop** on the sequence, forwarded to every child, so a whole set can be rendered in `exam` or `review` mode in one place.

### Patch Changes

- 0d62bca: Fix package resolution for CommonJS TypeScript consumers, and gate it in CI so it cannot regress.

  **A CommonJS TypeScript project could not import these packages at all.** Both `exports` maps declared a single `types` condition pointing at the ESM `.d.ts`, which was then served to `require` as well. TypeScript under `node16`/`nodenext` resolution reported the declaration as ESM and failed the import with `TS1479` ("the current file is a CommonJS module whose imports will produce require calls"). `are-the-types-wrong` flagged every entrypoint as "Masquerading as ESM". The `types` condition is now nested inside each format, so `require` resolves the `.d.cts` declaration that was always being built:

  ```jsonc
  ".": {
    "import":  { "types": "./dist/index.d.ts",  "default": "./dist/index.js"  },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
  ```

  This is a resolution fix only — no build change, no runtime change, no API change. ESM and bundler resolution were already correct and are unaffected. It matters most for server-side use: a Node grading service or queue worker compiled as CommonJS can now `import { evaluate, redact } from '@intellectif/lk-core'` directly, instead of working around it with `await import()` or switching `moduleResolution`.

  **Raised the `zod` floor to `^3.25.1` (lk-core).** The previous range allowed `zod@3.25.0`, which declares a `./v4` export whose target files are absent from the published tarball. Since the schema layer imports `zod/v4`, any install that resolved exactly 3.25.0 failed with `MODULE_NOT_FOUND` in both ESM and CJS. No supported version is dropped — 3.25.0 was never functional here.

  **New CI gate:** `publint` and `are-the-types-wrong` now run on every build (`pnpm check-packaging`). `node10` resolution is deliberately ignored — that is TypeScript before 4.7, and this SDK requires React 19.

- Updated dependencies [b96969b]
- Updated dependencies [d08a518]
- Updated dependencies [0d62bca]
  - @intellectif/lk-core@0.4.0

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
