# @intellectif/lk-react

## 6.0.0

### Minor Changes

- 4d0bd5a: Resume and review — an interrupted attempt can be reopened where it was left.

  An integrating application maintains a ~500-line exam renderer and a ~425-line review modal, and the reason is not styling: `ActivitySequence` could not resume an interrupted attempt and could not render a finished one. A learner at question 18 of 20 whose tab crashed came back to question 1 with all twenty blank, however faithfully the responses had been persisted — the pager's position and per-slot answers were the one part of an attempt a consumer could not restore.

  **`AttemptState`, bound to its plan.** `serializeAttemptState(plan, { responses, submittedSlotIds, index, savedAt })` captures an attempt in progress; `restoreAttemptState(plan, state)` reopens it. The `planHash` check is the point: slot ids are short and stable by design, so a snapshot from a _different_ paper — last term's midterm, a sibling version, a copy-pasted attempt row — lines its answers up against the wrong questions and looks entirely plausible doing it. Comparing the paper's fingerprint makes that impossible rather than unlikely.

  Validation happens on the way **in**, not on the way out: a response recorded against a slot the paper does not contain is a bug at the moment it is written, and finding it when a learner tries to resume is finding it far too late. An `index` that is not a position the plan has is refused for the same reason, and `restoreAttemptState` refuses an envelope `stateVersion` it does not understand rather than reinterpreting it under this version's rules and re-stamping it — which would destroy the evidence it had ever been anything else.

  Snapshots are copied **deeply**. A one-level copy hands back the caller's same response objects, and every `LearnerResponse` shape is an object: a consumer whose reducer edits an answer in place — an Immer draft, a push onto a multi-select, `answers[blankId] = text` — would mutate every snapshot ever taken, so the stored answer retroactively became the new one, `diffResponses` saw nothing, and a delta autosave silently wrote nothing for a change the learner really made.

  The SDK reads no clock — pass `savedAt` — so the function stays pure and reproducible in a test.

  **`diffResponses(before, after)`** reports what moved between two snapshots, including an answer the learner **cleared**, which comparing the later snapshot alone cannot see. It compares through the canonical form, so a response that survived a JSON round-trip with its keys reordered is not reported as a change the learner never made — while a reordered _selection_ is, because that is what they picked.

  **`ActivitySequence` gains five props.** `defaultIndex` reopens on the stored question, clamped to one the paper actually has — including when the value is not a number at all, which `Number(row.last_index)` produces from a NULL column and which previously survived every clamp and rendered an empty page. `onIndexChange` reports every position the pager lands on, not only learner clicks: a clamp it had to apply and the reset a set change performs are positions a consumer must persist too, and reporting only clicks left storage disagreeing with the screen. `responses` seeds each slot's saved answer by `slotId` — as `defaultValue`, so a restored answer stays editable, since resume is not a freeze. `submittedSlotIds` reopens already-committed questions as committed; without it a summative resume unlocks everything the learner had submitted, and they can change and re-submit it. `outcomes` forwards the server's verdict per slot, which in `review` mode is the only thing that marks correctness; the client never scores, so a review render without it shows the answers and no verdict rather than inventing one.

  The three seed props (`responses`, `submittedSlotIds`, `outcomes`) are keyed lookups guarded with `Object.hasOwn`, so a slot keyed `constructor` cannot resolve a function off the prototype chain into a question. They apply at mount and stop at the first set change — slot ids repeat across papers, so re-applying them after the entries changed dropped one paper's answers under another's questions.

  **`defaultSubmitted` on every activity component**, and an optional initial state on `useActivityState`, are what make the submitted half restorable. `reset()` now takes the state to return to, because "reset" for a restored item does not mean idle: the Req-3.7 data-change effect reset unconditionally, and in `FillInTheBlanks` and `WrittenResponse` — which had no mount identity guard — it ran right after the first paint and undid the seed it had just been given, so `defaultSubmitted` was a no-op for those types entirely. All three now guard the mount and reset to the _current_ seed.

  **`SequenceItemOutcome` gains a `restored` arm.** A slot the learner had already submitted mounts locked and will not submit again, so leaving its outcome null meant `onFinished` waited forever on something that could never arrive — a resumed attempt could never signal completion, however many of the remaining questions were answered. Restored slots are seeded at mount, firing no callback, so a later submit of the last outstanding slot completes the set. An attempt that was already complete announces nothing.

  **The sequence's `shuffleSeed` now reaches the option shuffle.** It was forwarded to `flattenSequence` for question order but never to `MultipleChoice`, which invented a fresh per-mount order — so a resumed or reviewed item showed the learner's answers against a different arrangement than the one they sat. An appeal about "the second option" was about a different option.

  **`MultipleChoice` now resets to `defaultValue` rather than to empty** when its `data` prop changes identity, matching what `FillInTheBlanks` already did. Clearing looked safer, but `data` identity is a poor proxy for "different question": a parent building entries in render — `activities={raw.map(redact)}`, the documented exam pattern — hands over new objects every render, and clearing wiped every _restored_ answer on the first unrelated re-render.

### Patch Changes

- Updated dependencies [4d0bd5a]
  - @intellectif/lk-core@0.7.0

## 5.0.0

### Patch Changes

- 07672b3: Make the grading surface reachable, and correct what the docs promise.

  An evidence sweep of a production integration found it pinned to `lk-core@^0.3.0` — so none of the v0.4 grading work was callable there — while two of the exact defects that work exists to prevent were live in its gradebook: a language model computing the weighted total of record for every essay, and an ungraded essay recorded as a hard zero that flowed into the learner's pass/fail. The features were shipped and correct. The obstacles were on this side.

  **`CriterionScore.maxScore` (new).** `gradeFromRubric` required every criterion score to be pre-scaled to `[0,1]` and _rejected_ anything else. Real graders work out of 100, or out of 9 for a CEFR band, or out of a per-criterion points total — so the rejection sent integrators back to letting the model produce the weighted total itself, which is precisely the arithmetic this function exists to take away from it. Declare what each score is out of and the SDK normalises before weighting; a rubric may mix scales. Omitted, it defaults to `1` and the previous arithmetic is byte-identical. A `maxScore` that is zero, negative or non-finite is reported `unscorable` rather than divided by, and the out-of-range message now names `maxScore` as the remedy instead of telling the caller to normalise by hand.

  **Per-type redacted types (new).** `redact()` returns `RedactedActivityData`, which proves a payload is learner-safe but is index-signature typed and says nothing about its shape — right for the assertion, useless for anything that has to render or transport the result. Every integrator re-declared those interfaces by hand and they drifted. `RedactedMultipleChoiceData`, `RedactedFillInTheBlanksData`, `RedactedWrittenResponseData`, the `RedactedActivity` union, `RedactedStimulus` and the option/blank shapes are now derived from the strict schemas with `z.infer`, so the type and the validator cannot disagree, with tests pinning them to what `redact()` actually produces.

  **`<WrittenResponse>` normalises each criterion it displays.** `gradeFromRubric` stores the grader's judgements verbatim, in the units the grader used, so a grade stays auditable years later — which means anything _displaying_ a criterion has to normalise it, exactly as the overall score is already normalised against its own `maxScore`. The review renderer printed `score * 100`, so the moment a criterion could legitimately be `82 / 100` it would have read "8200%". Caught before release; the same review path is now tested end to end through `gradeFromRubric` with mixed native scales rather than pre-scaled `[0,1]` fixtures.

  **`docs/upgrading.md` (new)**, leading with the two grade defects and what to call instead, and covering the `passed: boolean | null` and list-vs-count adjustments that adopting `composeAssessmentScore` requires.

  **A documentation-truth pass**, treated as a correctness deliverable:

  - The root README stated `redact()` strips **rubrics**. It does not, deliberately — a rubric tells the learner what they are assessed on — so an integrator trusting the README would ship rubrics to an exam client believing they were stripped. An in-source docblock contradicted the policy three lines below it.
  - Both READMEs denied any resume capability ("no `initialResponse` prop → cannot re-hydrate a prior attempt") months after `value`/`defaultValue`/`onChange` shipped in lk-react 2.1.0.
  - The published `.d.ts` told every IDE that `questionHtml` and `promptHtml` are "not rendered by the SDK yet". Both render, through a caller-supplied sanitiser. (`passageHtml` genuinely is not rendered; that JSDoc was correct and stands.)
  - The authoring guide said the scoring engine never returns feedback and capped multiple choice at 10 options; `score()` has selected feedback on `passed` since 0.3.0 and the schema allows 26.
  - `lk-react`'s README omitted `<WrittenResponse>` entirely, and `lk-core`'s advertised roughly its 0.2.x surface on a package published at 0.4.0 — no `evaluate`, registry, `redact`, `GradeRecord` or composition.

  **`@intellectif/lk-server` is deleted.** It was a private, empty placeholder for its whole life, with no thesis anyone could state. An empty package with no purpose is a liability, not an option held open.

- Updated dependencies [07672b3]
- Updated dependencies [e5857b2]
  - @intellectif/lk-core@0.6.0

## 4.0.0

### Minor Changes

- 2d962aa: Shared stimulus and item groups — the reading/listening-comprehension container.

  **The gap was a container, not an item type.** Real comprehension content is one passage or recording serving several questions; with nowhere to put the passage, it ended up hidden behind a toggle or pasted into every item. `Stimulus` and `ItemGroup` are that container, modelled as **content** so they drop into a sequence, a lesson quiz or an exam section alike. `kind` is enforced (a `text` stimulus needs a body, an `audio` one needs audio media, a `video` one accepts an embed), `bodyHtml` requires the plain `body` it falls back to, and `transcript` is the one author-only field. `validateItemGroup` validates the container, the stimulus and every item against its registered schema, reporting an unregistered item type rather than throwing — an author fixing a six-item group wants every problem listed.

  **Ordering lives in lk-core, so the server and the client agree.** `flattenSequence(entries, { shuffleEntries?, seed? })` turns activities and groups into presented slots. Groups are **shuffle-atomic** — a section shuffle moves a group as one block and never interleaves two passages' questions — and only a group that declares `shuffle: 'within-group'` reorders its items. A seed is **required** whenever anything shuffles, and an **empty group is refused**: contributing no slots would delete a whole section from a sequence that still looked well-formed, and `composeAssessmentScore` would then report a `final` grade over the survivors. Each slot's `slotId` comes from the _authored_ position, so it is unique and stable under shuffling.

  **Redaction.** `redactItemGroup` / `assertRedactedItemGroup` extend the fail-closed model to the container: the transcript goes, the passage stays, every item is proven learner-safe against its own type's schema, and failures are reported at `items.<index>`. `item-group` is reserved in the registry.

  **React.** `ActivitySequence` accepts `SequenceEntry[]`, flattens groups into consecutive questions, and mounts each group's stimulus **once**, kept beside every question in the group. New `shuffle`, `shuffleSeed`, `sanitizeHtml` and `onSubmit` props; new `<StimulusPanel>`, also exported for custom runners.

  ***

  The rest of this entry is what a review of the above turned up. Several are older defects the group work only made visible.

  **`ActivitySequence` had no exam response channel at all.** In `exam` mode the components deliberately never grade: they emit the raw answer through `onSubmit` and return before `onComplete`. The pager forwarded `onComplete` and nothing else, so an exam runner received _nothing_ — no response, no completion, for any question. `onSubmit(response, { slotId, index, activityId })` is new and fires in every mode before grading, and an exam slot now records a `responded` outcome so `onFinished` reports the finished set instead of never firing. (`SequenceItemOutcome` gains that third arm, so an exhaustive `switch` over it needs a new case.)

  **Hiding a pane did not stop its media.** The pager keeps every question and stimulus mounted so answers survive back-navigation, and toggles visibility with `hidden` — which is `display: none`, and CSS does not touch playback. A recording started for one question carried on underneath the next, its controls removed from the page and from the accessibility tree, with no way to stop it but navigating back. Panes now pause their `<audio>`/`<video>` as they hide, preserving `currentTime`: a recording keeps its position between questions of its own group, stops on the way out, and never auto-resumes. A provider `embed` cannot be controlled this way and is documented as such. This affected per-question media too, since before item groups existed.

  **Navigation put focus on the passage, not the question.** The stimulus was rendered inside the region labelled "Question 3 of 5", ahead of the question, so every Next dropped focus onto a landmark that began with the whole passage, keyboard users tabbed through it (audio controls included) before reaching the question, and a region sat nested inside a region. The stimulus is now a sibling of the question region: same visual order, still a landmark to jump back to, focus lands on the question.

  **`onActivityComplete` could not identify what it had completed.** It reported the _presented_ index, which moves under shuffling and already differs from the slot identity once a group is present — while `composeAssessmentScore` keys on `slotId`, so persisted rows could not be reconciled with the grade. It now receives `slotId` as a third argument (existing two-parameter handlers keep compiling).

  **A reordering set change could leave a sequence unfinishable.** Changing the presented order cleared the recorded outcomes but left the children mounted under unchanged keys — and therefore still `completed`. Those slots could not be answered again and nothing would refill them, so the set could never finish. A reset now resets both halves.

  **Same-tick completions could be lost.** Outcomes were read from a `useState` closure, so two slots completing in one tick both saw the pre-update array and the second overwrote the first. They are held in a ref, written synchronously.

  **Redacted groups did not type-check into the pager**, and the obvious fix does not work: `Renderable<T>` is built on `Omit`, which does not distribute over a union, so `Renderable<ActivityData>` collapses to the fields every activity shares and `.type` stops narrowing — widening the prop to it would have broken the pager's own dispatch and every custom renderer. `RenderableActivity` distributes properly (and fixes `ActivityProps`, where custom renderers could not narrow `data` either), and `asRenderableSequence` is the single documented crossing for `RedactedActivityData`, whose all-`unknown` fields satisfy no widening at all.

  **`FillInTheBlanks` accepted redacted data in `practice` mode.** It would then call `score()` from the submit handler — where React error boundaries cannot reach — throwing after the learner had typed their answers. It now fails at render like `MultipleChoice` already did.

  **`seededShuffle` gains an opt-in `version`.** Version 1 takes the Fisher–Yates index from its generator's low bits, which in an LCG are strongly correlated: on a four-option item only 12 of 24 orders are reachable _for any seed_, and the last authored option lands first 8% of the time against 42% second — a real fairness defect on an exam. Version 2 draws from the high bits and reaches every order uniformly. **Version 1 remains the default**, because the permutations are a wire contract: an attempt may be stored with only its seed, and a review render must reproduce what the learner saw, so changing the default is a package major. Use `{ version: 2 }` for new content.

  **A stimulus no longer lends its language to the SDK's own text.** `lang` was set on the whole panel, so a screen reader read this package's English strings — the region's name, "Questions 3–5" — in the passage's voice (WCAG 3.1.2). It is now declared on the authored parts only.

### Patch Changes

- 339a5e0: Hardening: a typecheck gate, descriptor-driven xAPI interop, and an opt-in rounded item threshold.

  **The test suites did not compile, and nothing noticed.** `tsc` only ever ran over `src/` as part of the build, so type errors in test files accumulated unseen — and a released defect (`redact()` being uncallable with the SDK's own exported interfaces) survived precisely because the suite that should have caught it was not type-checked. Both packages now have a `typecheck` script covering the full program, tests included, wired into `turbo` and CI. Getting to zero surfaced real problems rather than noise: matcher types that were never in the program (a `vitest-axe` augmentation the package does not ship), a fetch mock whose untyped parameters made `mock.calls[i][1]` an empty tuple so header assertions only compiled behind a cast, and a Node-only `Buffer` in a browser package's test.

  **`xapiDefinitionFor(data)` (new).** `ActivityTypeDescriptor.interop` declares the activity-type IRI, the cmi.interaction type and how to derive `correctResponsesPattern` — and had **no reader anywhere**. Every renderer rebuilt the same strings inline, which is the same "declared but never used" defect this SDK has fixed elsewhere. The built-in components now read the descriptor, so a consumer-registered activity type gets correct xAPI interop with no component changes. Returns `{}` for an unregistered type, so it is always safe to spread.

  **`computePassThreshold(data, score, rounding?)` — new optional third argument.** Item-level pass/fail still compared raw floats with `>=`, so an item displayed as "70%" could be recorded as a fail at 69.6 — exactly the disagreement `RoundingPolicy` eliminates for assessment totals. Passing a policy compares both sides rounded, via `gte`. It is **opt-in**: enabling it by default would change item-level pass/fail for any score inside the rounding band, and this SDK does not alter historical grades without an explicit decision. Absent, the comparison is bit-for-bit what it has always been.

- Updated dependencies [339a5e0]
- Updated dependencies [2d962aa]
  - @intellectif/lk-core@0.5.0

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
