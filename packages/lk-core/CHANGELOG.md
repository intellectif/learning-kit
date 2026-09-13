# @intellectif/lk-core

## 0.9.0

### Minor Changes

- 8ca07c8: Authoring: tell an unfinished question from a wrong one.

  `validateActivity` answers "may this be stored?", and to that question a question an author added a second ago and a broken one get the same answer. An editor that used it as its only check reported every new question as an error — enough to disable a whole form's Save button and blank its preview.

  **lk-core**

  - `validateDraft(type, draft)` returns `{ status: 'complete', data, issues: [] }` or `{ status: 'incomplete' | 'invalid', issues }`. Each issue is a `ValidationError` plus a `severity`, at the paths `validateActivity` reports. Its `code` is documented per type in the authoring guide for every problem the checks recognise; anything else is the schema's own diagnostic, at `invalid`. There is deliberately no `success` boolean, which would have to call an incomplete draft either a success or a failure.
  - It is stricter than `validateActivity` and never looser. It reports a title or option text that is only whitespace, a blank written-response `prompt` even beside `promptHtml`, a rubric criterion name that is only whitespace, a rubric whose weights are all 0 or add up to more than a number can hold, a fill-in-the-blanks match `locale` that is not a language tag (scoring would throw on it), and `redacted: true`. A `null` in a required field reads as not set; any other `null` the schema refuses is `null_not_allowed`, for every registered type. It does not report `minWords: 0`, which means no lower limit, or a rubric weight above 1.
  - `createDraft(type, { newId })` returns an empty draft that `validateDraft` reports as `incomplete`. It invents no ids, and a new multiple-choice draft marks no option correct, so an untouched correctness control can never become an answer key.
  - `ActivityTypeDescriptor.authoring` — `createDraft` and `checkDraft` — gives a registered type the same support. The three built-in descriptors carry one.

  **lk-react**

  - `<ActivityPreview>`, also at `@intellectif/lk-react/components/ActivityPreview`, renders a draft in any `renderMode` with a simulated `response` — marked with `evaluate()` in `review` — and renders a notice, or your `fallback` with the issues, while the draft is not complete. Nothing it renders is recorded, and a recording's play limit is enforced in memory in `practice` and `exam`. It checks the draft by content on every render, whatever order its keys are in, so an editor that rebuilds or reloads its payload does not restart the question being tried.
  - `LkStrings` gains `previewIncomplete` and `previewInvalid`. A dictionary declared as a complete `LkStrings` must add both; partial overrides are unaffected.

  Nothing that already exists changes behaviour in either package. lk-react's major version comes from its lk-core peer range.

## 0.8.2

### Patch Changes

- e1b9bb9: Grade-stability vectors: lk-core's grading, frozen as data and shipped in the package.

  The standing rule for this package is that anything which can change a historical grade is a major release. The unit suite already asserted scoring numbers, but against source, and those assertions change alongside the code they test. Nothing froze them independently, and nothing checked them against the package you actually install. Now something does.

  `vectors/scoring.json` records 231 calls across every path that decides a grade — `score` and `evaluate` for each built-in activity type (including the legacy per-blank `caseSensitive` / `trimWhitespace` flags, and the refusal to score redacted data), written-response word counts recomputed from the text rather than taken from the client, `matchText` across every authored policy, rounding in every mode, `countWords`, `seededShuffle`, rubric grading, how a stored attempt plan becomes scored items, and whole-assessment composition — together with the exact value each returned. The values were frozen by executing 0.8.1, so **nothing about grading changes in this release**: the corpus records what already is.

  - **It is replayed on every change.** `pnpm test` replays it against source; `check-packaging` replays it against the built package, CJS and ESM; and CI runs both on Node 22 and on Node 24, the Node the release is built with. A vector that returns anything different fails the build, by name.
  - **It cannot drift from its inputs unnoticed.** `pnpm test` also fails when a case was never generated, a vector was deleted by hand, or a frozen call's arguments no longer match its case. The generator adds vectors freely but refuses to rewrite or remove one without `--accept-grade-change`.
  - **Its coverage was tested rather than assumed.** The scoring source was deliberately broken — comparisons flipped, defaults changed, guards removed — and every one of those breaks that can reach a stored grade now fails at least one vector. The breaks that still pass change no grade: they touch feedback prose, xAPI patterns or a hook nothing in this package calls, have no observable effect, or sit exactly on a floating-point epsilon that only the epsilon itself can reach.
  - **You can replay it against the build you install.** It ships in the tarball beside `vectors/replay.mjs`, which does the comparison, so a test suite that pins lk-core's arithmetic no longer has to restate it. `vectors/README.md` has the recipe.
  - **It is deliberately not an export.** An export would be new public API — a minor, which would force a `@intellectif/lk-react` major for a file of test data. The corpus is reached by resolving `@intellectif/lk-core/package.json`, which is already exported.

  Several vectors pin sharp edges on purpose, each with a note saying why. None of them changes in this release:

  - rubric weights are read from each criterion and never joined from the activity's rubric;
  - with no activity, `gradeFromRubric` compares against a literal `0.7` rather than `DEFAULT_PASS_THRESHOLD`;
  - an unscorable item leaves the denominator of a composed score, which stays final;
  - a paper whose graded sections all weigh 0 records a final 0 and a fail;
  - `ignorePunctuation` on its own leaves the space a removed mark stood beside, so `"hola !"` does not match `"hola"` unless `collapseInnerWhitespace` is also set;
  - band classification absorbs float noise just below a boundary, but not a genuine shortfall;
  - `levenshtein: 1` against a one-character answer accepts any single character.

  Also: the README now states the real browser floor — the built code needs `Object.hasOwn`, so Chrome and Edge 93, Firefox 92, Safari 15.4 — and the contributor docs no longer describe a Node 20 CI matrix that was retired.

## 0.8.1

### Patch Changes

- Close two more fail-open leaks in `redact()`, bind a play budget on an essay slot, and make three guards that could not fail actually fail.

  Everything here is a defect in 0.8.0 / 7.0.0, found by auditing that release rather than by using it.

  **`redact()` leaked through two more object leaves.** 0.8.0 fixed `media`, which was classified as a single `public` leaf so the author's object was returned by reference without recursing. The same shape survived in two more places:

  - **`rubric`.** A grader's `modelAnswer` or `aiModel` parked on the rubric reached the exam client and `assertRedacted` blessed it. The rubric stays learner-visible — it tells a learner what they are graded on — but that now means its _documented_ fields are visible (`label`, and each criterion's `name`, `description`, `weight`), not anything anyone stashes under it.
  - **`feedback` and each blank's `match`.** These are `answer-key`, so the default `reveal: 'none'` drops them entirely and the flaw is invisible there. `reveal: 'after-submit'` keeps them, and kept them **whole**: a grader's private note or tuning knob parked beside the documented fields went to the learner along with the answer key, and the projection aliased the caller's object. An after-submit reveal now shows `correct` / `incorrect` and the documented `TextMatchPolicy` keys, and nothing else.

  A nested projection that keeps no fields is now omitted rather than emitted as `{}`, so giving an all-`answer-key` object a nested policy does not turn its absence into an empty object. Verified against the published 0.7.1 build: well-formed content redacts byte-identically in **both** reveal modes, so the only behaviour change is that undocumented sidecars stop travelling.

  **A budgeted recording never bound on a written-response slot.** An essay carrying a recording with `maxPlays` rendered an **unlimited** player — no plays-remaining, nothing counted — which on a listening-and-writing paper is exactly the failure the budget exists to prevent. `<WrittenResponse>` was the one branch of the pager whose props were written out by hand rather than spread, and it had been the branch left behind three separate times: `defaultSubmitted`, the redacted-in-`practice` guard, and the media budget. It now derives its props by subtracting `onComplete` from the same bag the other types receive, so a prop added to that bag cannot be forgotten there again.

  **And the guard meant to catch that could never fire.** `ActivityMedia`'s "budget declared with no binding" throw sat _after_ the early return for `controls: 'minimal'` — which a budgeted policy always resolves to — so it was dead code for the one case it was written for. Moved ahead of the branch, and given the standalone test that the pager can never provide: `ActivitySequence` throws on a missing `onPlayConsumed` before children mount, and once that callback is supplied it passes a binding, so no pager test reaches this path either way.

  **Three guards that could not fail.** Found by mutation-testing the suite — breaking each mechanism and checking whether any test noticed:

  - The last-play confirmation gate had **no coverage at all**, and was silently absorbing the press in two neighbouring resume tests: both used `maxPlays: 2` with one play spent, so the press they made was swallowed by the gate and their assertions held whether playback resumed or a dialog opened. Gutting resume detection left the whole file green. Both now use a budget that clears the gate and assert that playback actually resumed.
  - Partial multiple-choice scoring asserted only that a score with an off-paper option id lands in `[0, 1]` — which holds whether that id is ignored, credited, or treated as wrong. Now pinned to exact values, one of which is only reachable by the correct treatment.
  - The empty-input fuzzy guard was probed with three spaces against a one-character answer, which the length-difference early exit refuses before the guard is ever consulted. A single space now probes the guard itself.

  Also: `classifyBand`'s float tolerance was pinned only to within `[0, 0.01)` — seven orders of magnitude of slack, all of it in the promoting direction the function exists to prevent — and is now straddled at its real epsilon; and the cross-type resume test gained its `written-response` row, asserting the restored draft survives rather than only that the control is locked.

## 0.8.0

### Minor Changes

- 011e0d1: Media playback policy — a listening paper can now be played on the paper's terms, and two exam-integrity guards that were watching the wrong doors are closed.

  Listening assessment was the last thing in v0.4 that could not be run through the SDK at all. An integrating application had replaced the SDK's audio rendering wholesale with a bespoke 56-line player, and the reason was capability, not styling: `<audio controls>` offers a scrubber, a speed control and a download, and a listening paper needs none of them.

  **`media.playback`, on audio.** `{ maxPlays, seek, rate, controls, nativeControlHints }`, every field optional and every default reproducing the pre-0.8.0 behaviour byte for byte. `{ maxPlays: 2 }` alone is a complete policy: `controls` resolves to `minimal` and `seek` to `none`, because those are the only values that can keep the promise. The browser's own bar leaves its play button enabled after a budget is spent and keeps a scrubber that would move and silently snap back — a control that looks operable and does nothing (WCAG 3.2.2 / 4.1.3). So an enforcing policy replaces the bar rather than lying with it, and the schema **refuses** the combinations that would: `controls: 'native'` with a budget, `maxPlays` with `seek: 'allow'` (scrubbing back would replay the whole recording for free), a bare `minimal` with nothing to enforce, and hints that an enforcing policy would render inert. `playback` on `video`, `image` or `embed` is rejected outright, with the reason: a provider iframe needs the provider's own JS API, and a video transport would have to own fullscreen and Picture-in-Picture, which this release does not.

  The policy object is **strict** while `media` stays loose. A typo one level down (`maxPlay`, `seeking`) would otherwise be accepted in silence and disarm the whole control on an exam that believed it was enforced.

  **What replaces the browser's bar is a superset, minus what the policy removes on purpose.** Play/pause, elapsed and total time, mute, volume, an optional speed control, an optional scrubber, and a live plays-remaining status. Volume and mute are never restricted by any policy — they affect no assessment property, and a learner in a lab with a locked OS volume has no other lever once the native bar is gone. An exhausted play button uses `aria-disabled`, never `disabled`: a natively disabled button leaves the focus order, so a learner who tabs into nothing is told nothing, and disabling it mid-attempt would drop focus to `<body>`. Pressing it re-announces the refusal. Every string is overridable through `mediaStrings`, because "No plays remaining" is the highest-stakes text on a listening paper and shipping it as untranslatable English inside a Spanish panel was not acceptable. `review` mode never enforces: a graded paper cannot be changed by listening again, and taking away a learner's scrubber and speed control while they work out what they got wrong helps nobody.

  **Honest about what a browser actually gives.** `maxPlays`, `seek: 'none'` and `rate: 'fixed'` are _enforced_: a refused play is stopped inside the browser's own `play` event, verified in a real engine at `currentTime < 0.25s`, and the budget lives on the element's event rather than on the button so a hardware media key or a scripted `play()` goes through it too. `nativeControlHints` is _advisory_: it emits `controlsList`, which some engines ignore entirely, and `hide-download` **never prevents a download** — the URL is in the page and the bytes are in the network panel. Nothing here survives devtools. Those are not adjectives; `packages/lk-react/e2e/media-capability-probe.spec.ts` exercises each mechanism in a real browser and runs in CI, so no documented claim outlives the behaviour it rests on.

  **A budget is only as durable as your write.** The SDK reads and writes no store, so `maxPlays` means nothing across a refresh unless the consumer persists it. `mediaBudget.onPlayConsumed` is a payment, not telemetry: return a promise and playback is held until an atomic server write settles — the only tier in which "consumed before audible" is true of storage rather than only of memory, and the only construction that catches a second tab, since two mounts seeded at 0 both claim 1. Return nothing and playback starts immediately, which is fine for practice — but do not debounce it and do not batch it with the answer autosave; an eight-second debounce is exactly long enough to start a third play and hard-reload. In `exam` mode, budgeted media without `onPlayConsumed` throws at render, and so does a resumed attempt that omits the ledger: a paper granting unlimited plays while showing "2 plays remaining" is indistinguishable, to the learner and to an appeal, from one that works.

  `MediaPlayLedger` is a **separate** persisted object, not a field on `AttemptState`. Two reasons, both of which bite in production: it is written on a different cadence, and `restoreAttemptState` rebuilds its output field by field — so a build predating this release would not merely fail to read the counts, it would write the snapshot back without them and erase spent plays across a staged rollout, at exactly the moment they matter. `serializeMediaPlayLedger` / `restoreMediaPlayLedger` bind it to its paper by `planHash` for the same reason `AttemptState` is bound.

  Budgets are frozen into the plan by `planAttempt`, so editing `maxPlays: 2 → 4` mid-window cannot change what a past learner was held to. `planAttempt` also refuses a paper where one recording is budgeted under several keys: six questions each carrying the same clip at `maxPlays: 2` is twelve plays of one recording. Questions that share a recording belong in an item group — one stimulus, one budget, keyed by the entry so a six-question group gets one budget rather than six.

  **`redact()` had a fail-open hole at exactly this nesting level, and it is fixed first.** `media` was classified as a single `public` leaf, so the whole object was forwarded without recursing — and an unclassified key nested under it survived `redact()` **and passed `assertRedacted()`**. A hand-planted `media.secretAnswerHint` reached the learner on 0.7.1. The documented fail-closed contract ("a field the policy does not classify is removed") stopped at the media boundary; it no longer does. Unknown keys under `media` are now dropped and rejected, `RedactedMediaSchema` is strict like the shapes that embed it, and `redact()` returns a copy rather than an alias. Verified against the published 0.7.1 build: every existing paper plans to a byte-identical `planHash` and redacts to identical output.

  **Two exam-integrity guards that were watching the wrong doors:**

  - **An unseeded item-level shuffle rendered happily in `exam` mode.** `ActivitySequence` demanded a `shuffleSeed` for `shuffle="entries"` and for a group's `shuffle: 'within-group'`, but never for an activity's own `data.shuffle` — and `<MultipleChoice>` invents a per-mount seed when none reaches it, in every render mode. A single item with `shuffle: true` produced four different option orders across four mounts, without complaint: an arrangement the server cannot rebuild, which is precisely what the guard exists to refuse, arriving through the one door it did not watch.
  - **`<WrittenResponse>` had no redacted-in-`practice` guard.** Its two siblings have refused redacted data there since 0.5.0. The asymmetry looked harmless because this component never scores locally — but `practice` still runs the local submit path and emits a practice-mode xAPI statement for work the server is meant to grade, so an all-essay redacted paper mounted without `renderMode` rendered, stayed answerable, and reported success at every step. The one item type whose grading is entirely someone else's job was the one that failed silently.

  Both now throw at render. That is the breaking half of this release for anyone who was relying on the old behaviour — though what they were relying on was an exam whose order could not be reproduced, or an essay graded nowhere.

  **On `maxPlays` specifically, and stated plainly because this is a public changelog:** it is a roadmap hypothesis, not a replicated production behaviour. A search of the one integrating application for any play-count identifier, UI string or database column returned nothing. What it had actually built was seek, download and rate suppression — which is why those are the parts with a real usage story behind them, and why `maxPlays` ships with its persistence requirements spelled out rather than assumed.

  **A blank left empty could score as correct.** Levenshtein distance from an empty string is just the answer's length, so `levenshtein: 1` on a one-letter blank — an article, or "I" — accepted an **unanswered** blank: `matchText('', ['a'], { levenshtein: 1 })` returned `{ matched: true, via: 'fuzzy' }`. On a partial-credit gap-fill that silently awarded a mark for work the learner never did, and no test covered the path. An empty or whitespace-only input no longer reaches the fuzzy stage at all. Exact and normalized matching are untouched, so an author who deliberately lists `""` as an accepted answer still gets it, one stage earlier.

  **This can change a recorded grade** — for exactly one population: attempts where an unanswered blank was marked correct by fuzzy tolerance. Every one of those marks was wrong. If you have stored gap-fill grades under a `levenshtein` policy with very short accepted answers, they are worth recomputing. Related hazard, unchanged and now documented rather than silently fixed: `levenshtein: 1` against a one-character answer still accepts _any_ single character, because that is literally what an edit distance of 1 means. Prefer exact matching on single-letter blanks.

  **Three skin bugs in the post-submit marking**, all reported by a consumer against 6.1.0 and all reproduced by computed style in a real engine before being fixed:

  - **A correctly chosen option kept the selection colour.** Specificity, not order: `.lk-mc-option:has(input:checked)` is (0,2,1) and outranked `.lk-mc-option[data-correct="true"]` at (0,2,0), so the single most reassuring state in the component — "you picked this and it is right" — was the only one that did not mark. The wrong-and-chosen case worked only because someone had written the combined selector for it; this adds its missing counterpart.
  - **Hovering a marked option repainted it in the selection colour.** `.lk-mc-option:hover` was unguarded, and for an unchosen distractor no marking rule matches at all — so after submit, hovering a disabled, already-marked option showed the "still selectable" affordance. Hover is now scoped to `:not([data-correct])`, which is precisely "not yet marked".
  - **Option text wrapped under a lonely radio on narrow screens.** The option is a flex row and consumers commonly add `flex-wrap: wrap` so a per-option note can drop below it; in a wrapping container an item wraps _before_ it shrinks, and the text span had no flex contract. It now has one, with a minimum inline size so a wide sibling wraps instead of crushing the text into a one-character-per-line column.

  `e2e/skin-marking.spec.ts` pins all three by **computed border colour and box geometry** in a real browser. Unit tests assert class names and `data-*` attributes and can never see which rule wins, which is why this class of bug survived several releases.

  Fixing the first of those exposed a design gap the fix alone would have left in place: once a correctly chosen option marked green, it became indistinguishable from the correct answer a learner **missed**, which also marks green. The skin now separates them by weight rather than hue — chosen-and-right is solid with a tint and a `✓`, chosen-and-wrong is solid red with a `✗`, and the missed correct answer is a **dashed** green outline with a hollow `○` and no fill. Untouched distractors recede to 70% opacity, a figure chosen by computing the contrast (6.6:1; the first draft's 55% would have failed AA at 3.9:1). The glyphs also close a WCAG 1.4.1 gap: the component emits no correctness text, so a mark was previously carried by colour alone. They are decorative generated content on purpose — a translatable announcement belongs to the component and is tracked with the i18n work.

  Also in this release: `slotKey` containing a `.` is now rejected at `validateItemGroup` rather than at `flattenSequence`, so an author finds it instead of a learner; `InteractionKind` gains `media-play-consumed` / `-refused` / `-errored` / `-refunded`, emitted only when a budget is in force so a `review` replay cannot pollute the record an appeal reads; and the pager's stimulus pane now keys on the set as well as the entry, so a set change to a different paper that reuses an entry key remounts the panel instead of leaking a mount-only seed into the next paper.

  `@intellectif/lk-react` goes major because `@intellectif/lk-core` is a peer dependency and a core minor raises the floor, and because of the two new throws. Every new prop is optional.

## 0.7.1

### Patch Changes

- 58f0651: Make the published package match what the published docs promise — and fix the three defects that checking it exposed.

  Every claim on both npm pages and in the linked guides was checked against the **published tarballs** rather than the source, because the tarball is what an integrator actually installs. Three of the gaps were not documentation problems at all.

  **`'use client'` reached none of the shipped files.** Every source file declares it, but bundling drops module-level directives ("Module level directives cause errors when bundled … was ignored"), so the directive survived into **0 of 38** emitted modules — while three separate documents advertised RSC compatibility and the limitations table said "SSR / RSC: fully supported". Importing a component into a React Server Component tree failed for a package that promised the opposite. A build banner does not survive the treeshake pass either, so the directive is now re-applied to every emitted module after the build.

  Because this defect lives _only_ in the build output, no lint, typecheck or unit test could see it — so the fix ships with a gate that reads `dist/` rather than `src/`: `verify-dist` asserts every emitted module carries the directive, that stylesheets and declaration files do not, and that the built entries really export what the docs promise. It runs after `build` alongside `publint` and `attw`, and fails if the post-build step is ever removed or replaced with a banner.

  **`createTailwindTheme` was never exported.** It is implemented, unit-tested, and documented in four places — both READMEs, the subpath table and the styling guide, which gives a copy-pasteable import — but `src/theme/tailwind.ts` was never re-exported, so it reached no published build and the documented import was a module-resolution error. It now ships from `@intellectif/lk-react/theme/ThemeProvider` and the barrel. A missing re-export is invisible to every other check in this repo — the source compiles, the function's own tests pass, the package builds — so a test now pins the whole public export surface, and `verify-dist` additionally loads the _built_ modules, which is the only way to catch a bundler or exports-map regression.

  **The skin ignored the theme for Written Response.** Its block referenced `--lk-font-family`, `--lk-border-radius-md` and `--lk-color-on-primary`; none is a token. CSS treats an undefined `var()` as invalid at computed-value time, so those properties silently fell back to `unset` — the submit button drew the page's inherited text colour on a primary-coloured background, a real contrast risk, and the component followed neither the theme's font nor its radius. Corrected to `--lk-font-family-base`, `--lk-radius-base` and `--lk-color-surface`, with a test asserting the skin references only tokens `defaults.css` defines.

  **Grade-correctness corrections in the guides.** The upgrade guide told integrators to give an unanswered slot an `unscorable` outcome. Executed against the shipped build, a three-question paper with one correct answer and two `unscorable` slots composes to `status: 'final'`, `score: 1`, `passed: true` — a final, passing 100% for a paper the learner barely started, which is the exact defect this SDK exists to prevent. `unscorable` means "a grade is never coming", so the slot leaves the denominator _and_ the result may go final; `deferred` is what holds it provisional. Both guides now say so, and point at `scoredItemsFromPlan`, which defaults to `deferred` for this reason. The authoring guide had contradicted itself on the same point in two sections.

  The guides also claimed `roundGrade` "refuses" a non-finite input; it returns it unchanged (`gradeFromRubric` is the one that refuses), so `gte(NaN, …)` reads as an ordinary fail unless you guard. And `seededShuffle`'s uniform `version: 2` is documented as usable for new content, but no SDK ordering path accepts it — `flattenSequence`, `planAttempt`, within-group shuffling and `<MultipleChoice>` all use version 1 and expose no option — so the limitation is now stated instead of implied away.

  **Corrections to what the npm pages describe.**

  - `validateActivity` **throws** `UnknownActivityTypeError` for an unregistered type rather than returning `{ success: false }` — the case that arises exactly when a content bank carries consumer-registered types.
  - `score()` throws `DeferredScoringError` for a deferred-graded type and `RedactedScoringError` for a `redact()` projection. Both sit on the documented exam path; `evaluate()` is what to call there. The Errors bullet listed two of the four exported error classes.
  - The lk-core page's own "Running an exam" recipe called `redact()` on the entries it had just passed to `planAttempt`. Those entries may be item groups, and `item-group` is a reserved container rather than a registered activity type, so the documented exam path threw `UnknownActivityTypeError` for any paper containing a reading or listening group. It now branches on `isItemGroup()`.
  - `redact()` takes a single activity. Mapping a group's items through it and shipping the container leaves `Stimulus.transcript` — a listening passage's author-only transcript, i.e. the answers — in the learner's payload. `redactItemGroup()` / `assertRedactedItemGroup()` are now documented as the container equivalent.
  - `validateItemGroup` and `xapiDefinitionFor` appeared on neither page.
  - Attempt plans, attempt state and content hashing were absent from the lk-core page entirely, so a reader built the plan → `ScoredItem` bridge by hand.
  - The React page named two of the three activity components and none of `renderMode`, the controlled-component props, `shuffleSeed`, `asRenderable`, the sequence resume props, `onFinished` or the `renderers` registry.
  - Both "Retry" rows said a new `data` reference resets the activity to idle. It resets to its **seeded** state, so on the resume path it restores the previous answer — and a new React `key` does the same, because the seeds are simply re-read on the fresh mount. A genuinely fresh attempt needs the new `key` _and_ the seed props dropped.
  - `<WrittenResponse>` was covered by the claim that "every built-in component throws at render when handed redacted data" in `practice`. It does not: it never grades on the client, so it has no such guard and a redacted essay renders and stays answerable, running the practice submit path silently. Documented in the guides and in the `asRenderableSequence` doc comment.
  - `shuffleSeed`'s hover text said it is "required in `exam` and `review` mode — omitting it throws". It is required only when the sequence actually shuffles. The guard also does not cover an activity's own `data.shuffle`, where `<MultipleChoice>` still invents a per-mount seed in every mode — so an unseeded item shuffle yields an exam order the server cannot rebuild, without complaint. Both are now stated where a reader will meet them.
  - The release map's first row paired `lk-core@0.3.0` with `lk-react@2.1.0`. That pair does not install: 2.1.0 peers on `^0.3.1` (2.0.0 is the 0.3.0 partner), and 2.1.0 is the one minor in the table, because a `lk-core` patch does not force a major.
  - The React page said 6.0.0 "changes no React API" ten lines after listing the three props it added; 5.0.0 is the peer-only major.
  - `data-correct` was documented as landing on "options/blanks". It lands on `.lk-mc-option` but on the `input` _inside_ `.lk-fib-blank`, so a rule written against the documented selector never matches.
  - The custom-activity-type walkthrough titled "end to end" omitted the `declare module` augmentation, without which its own snippets do not compile (TS2345 / TS2322) — registration is a runtime act only.
  - `review` mode renders more of a `GradeRecord` than documented: the grade `feedback`, and a **learner-visible** notice when `requiresHumanReview` is true.
  - `HtmlSanitizer`'s hover text — the doc comment every rich-text integrator reads — promised `passageHtml` rendering that `<FillInTheBlanks>` refuses by design.
  - `MultipleChoiceData.shuffle` was documented as shuffling "per session"; order derives from `shuffleSeed` when given, and is reproducible only then.
  - The grade record's `evidence`, `rationale`, `confidence`, `grader` provenance and `usage` were described as rendered by the SDK. They are stored; only per-criterion scores and inline corrections are rendered.
  - Version labels were a release out of step in several places: `CriterionScore.maxScore` and the per-type redacted types landed in 0.6.0 (not 0.5), item groups in 0.5, attempt plans in 0.6 and attempt state in 0.7. The upgrade guide now leads with a `lk-core` ↔ `lk-react` release map, since a `lk-react` major is often only the peer-range bump.
  - `useXAPI` — the first symbol in both quick starts — had no doc comment at all.

  **Packaging.** Both packages gain `keywords`, `homepage` and `bugs` (npm showed none), a description matching the current surface rather than the 0.2-era one, `./package.json` in the exports map, and `CHANGELOG.md` in the tarball — which is where a reader lands when a major turns out to be a peer bump. `repository.url` now carries the `git+` prefix `publint` asks for.

## 0.7.0

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

## 0.6.0

### Minor Changes

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

- e5857b2: `planAttempt` — freeze what an attempt was served, so a grade stays defensible.

  A sequence definition is live content: it gets edited, re-ordered, corrected. An attempt is a historical fact. Until now nothing pinned the two together, and three separately-found defects all traced back to the same missing primitive — `composeAssessmentScore` **required** a stable `slotId` while the only producer of one was positional.

  **`planAttempt(entries, { seed, shuffleEntries, points })` → `AttemptPlan`.** Called once when the attempt starts and stored beside the responses. It freezes the presented order, each slot's identity and worth, and a fingerprint of the content behind it. Ordering comes from `flattenSequence`, so a plan and a live render with the same seed agree slot for slot.

  **Points belong to the paper, not the item.** The same question is worth 1 in a practice quiz and 3 in a final, so they are resolved once by a `points` callback and frozen — never read back out of content. A slot resolving to a negative or non-finite value is refused rather than allowed to poison the total.

  **`slotKey` — identity that survives editing.** A positional slot id is only valid against one version of the entries array: insert a question at the top of a published paper and every id beneath it shifts, so rows stored as `"3"` silently start naming a different question. An entry (or an item inside a group) may now declare `slotKey`, used verbatim in place of the positional path. Two entries colliding on one is an error, not a merge — responses stored against a shared identity could not be told apart. A key containing `.` is refused, since that separates a group from its item.

  **`verifyAttemptPlan(stored, current)`.** Ids survive an edit unchanged, so they cannot answer the question a remark or an appeal actually asks: _is this the paper the learner sat?_ Re-plan the current entries with the options the stored plan recorded — its `seed`, its `shuffleEntries`, the same `points` function — and this reports which items were edited, which stimuli were corrected, which were reweighted, what is missing, what was added, and what moved. Drift is not automatically a problem — a fixed typo changes a fingerprint without changing what was asked — but it is a fact somebody has to be able to see.

  **`scoredItemsFromPlan(plan, outcomesBySlotId, { missing })`.** Builds `composeAssessmentScore`'s input from the plan, so the denominator is the paper rather than whatever happened to be answered — building that list from the answers instead is how a paper silently shrinks and the remaining questions become worth more than the exam says. How an unanswered slot is filled is a decision with teeth; see below.

  **`contentHash` / `canonicalJson` / `fingerprint`** are exported for content fingerprinting generally. Canonical JSON sorts object keys (so a round-trip through a different serializer is not a false alarm), keeps array order, and distinguishes the non-finite numbers `JSON.stringify` collapses to `null`. The hash is deterministic and dependency-free, and is documented for what it is: change detection, not a tamper-evident signature.

  **A missing outcome is `deferred`, never `unscorable`.** The two are not interchangeable: `unscorable` means "a grade is never coming", so `composeAssessmentScore` drops the slot from the denominator _and_ lets the result go `final`. A three-question paper with one answer therefore composed to a final, passing 100% — the exact failure this helper exists to prevent. It now defaults to `deferred`, which holds the result `provisional` so nothing can be recorded, with `{ missing: 'zero' }` for a submitted paper whose blanks are genuinely blanks and a callback for anything else. `ItemOutcome`'s deferred `reason` gains `no_response_recorded`, because reusing `requires_async_grading` for an unanswered question would have been a lie.

  **`slotKey` survives redaction.** `redact()` is fail-closed, so an unclassified field is dropped — which silently stripped the very identity a plan and a live render must share. An exam client rendering a redacted paper derived positional ids while the server's stored plan held keyed ones, and the responses could not be matched back. It is now classified `public` assembly metadata on every built-in policy and on the group, and accepted by the strict redacted schemas.

  **`flattenSequence` refuses two entries sharing an entry key**, not just two sharing a full slot id. A loose activity keyed `"reading"` and a group keyed `"reading"` produce `"reading"` and `"reading.0"`, which never collide — while everything that reads the entry a slot belongs to, including the pager's stimulus grouping, treats them as one entry and shows the group's passage above the unrelated question.

  **`verifyAttemptPlan` reports a reweight** (`changedPointsSlotIds`). Points decide the grade, so changing them changes the paper without touching a question; leaving it out meant `matches: true` while `planHash` disagreed. **`AttemptPlan` records `shuffleEntries`** so a shuffled attempt can actually be rebuilt — the documented re-plan omitted it, returned authored order, and reported unchanged content as fully re-ordered. And **`slotKey` is excluded from `contentHash`**, so annotating an item with the key that pins its identity is no longer reported as "this question was edited".

  `flattenSequence` also now refuses duplicate slot ids, which were previously impossible by construction and become possible the moment keys are authored.

## 0.5.0

### Minor Changes

- 339a5e0: Hardening: a typecheck gate, descriptor-driven xAPI interop, and an opt-in rounded item threshold.

  **The test suites did not compile, and nothing noticed.** `tsc` only ever ran over `src/` as part of the build, so type errors in test files accumulated unseen — and a released defect (`redact()` being uncallable with the SDK's own exported interfaces) survived precisely because the suite that should have caught it was not type-checked. Both packages now have a `typecheck` script covering the full program, tests included, wired into `turbo` and CI. Getting to zero surfaced real problems rather than noise: matcher types that were never in the program (a `vitest-axe` augmentation the package does not ship), a fetch mock whose untyped parameters made `mock.calls[i][1]` an empty tuple so header assertions only compiled behind a cast, and a Node-only `Buffer` in a browser package's test.

  **`xapiDefinitionFor(data)` (new).** `ActivityTypeDescriptor.interop` declares the activity-type IRI, the cmi.interaction type and how to derive `correctResponsesPattern` — and had **no reader anywhere**. Every renderer rebuilt the same strings inline, which is the same "declared but never used" defect this SDK has fixed elsewhere. The built-in components now read the descriptor, so a consumer-registered activity type gets correct xAPI interop with no component changes. Returns `{}` for an unregistered type, so it is always safe to spread.

  **`computePassThreshold(data, score, rounding?)` — new optional third argument.** Item-level pass/fail still compared raw floats with `>=`, so an item displayed as "70%" could be recorded as a fail at 69.6 — exactly the disagreement `RoundingPolicy` eliminates for assessment totals. Passing a policy compares both sides rounded, via `gte`. It is **opt-in**: enabling it by default would change item-level pass/fail for any score inside the rounding band, and this SDK does not alter historical grades without an explicit decision. Absent, the comparison is bit-for-bit what it has always been.

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

## 0.4.0

### Minor Changes

- b96969b: Sectioned assessment scoring, with rounding treated as the two distinct operations it actually is.

  **`composeAssessmentScore(sections, policy)`** turns per-item outcomes into a weighted, sectioned grade: normalised section weights, per-section thresholds with per-section overrides, per-item `points`, and an explicit `passFailureReason` (`overall_below_threshold` | `section_below_threshold` | `both` | `null`).

  This exists because the formula is invariably written twice — once on the server that records the grade, once on the client that shows the learner their breakdown — and the two drift, usually on the scale (0–1 vs 0–100) or on whether a section override is honoured.

  **Ungraded work never counts as zero — and the two reasons for it are kept apart.** `deferred` items (a grade is coming) are excluded from the denominator, reported in `pendingSlotIds`, and hold the result at `status: 'provisional'`. `unscorable` items (a grade is never coming — an unregistered type, redacted data) are excluded from the denominator too, but reported separately in `unscorableSlotIds` and they do **not** hold the result provisional: `evaluate()` returns that status precisely so a mixed-version content bank does not crash an exam, and such an attempt still has to be recordable.

  `passed` and `passFailureReason` are also `null` when **nothing was gradable at all** — every item unscorable, or an empty assessment. There is no evidence either way, and a hard `false` would record a fail at 0% for a learner whose work was never gradable. While the result is `provisional`, they are likewise `null` rather than `false` — an attempt with unmarked work has neither passed nor failed, and returning `false` would let a UI keyed on `passed` show a fail for an essay nobody has looked at. Crucially, a section with nothing graded yet does not drag the total down: the weighted total is computed over the sections that _have_ something graded, with their weights renormalised among themselves. `SectionScore.normalizedWeight` reports that **live** weight (0 for a section contributing nothing), so a client can rebuild the grade from `sections[]` and agree with the record: `roundGrade(sum(section.score * section.normalizedWeight), rounding) === result.score`, exactly, by construction. Apply the same final rounding — the raw weighted sum of already-rounded section scores is not itself a rounded value (0.85 and 1.00 at equal weights sum to 0.925 against a recorded 0.93), so comparing it unrounded is off by up to half a quantum. The authored weight is still reported verbatim as `weight`. Without that, a midterm containing an unmarked essay reads as a failing 50% — a learner shown a fail for work nobody has looked at yet. A section with nothing graded is likewise never reported as having failed its threshold.

  **Items are keyed on `slotId`, not activity id.** The same activity can legitimately appear in two sections; keying on the activity collapses them into one and silently scores the second occurrence as zero.

  **`RoundingPolicy` — required, with no default, ever.** Rounding is two operations that must not share one policy:

  - **Grade rounding** (`roundGrade`) decides the number a learner is shown and recorded against. `dp` is required and load-bearing: at 2 decimal places a learner shown "70%" is not recorded as a fail at 69.6.
  - **Band classification** (`classifyBand`) deliberately **floors**, because over-placement is the more harmful error, so a boundary is never reached by rounding up.

  Supplying a single default would silently invert one of them, so the SDK supplies neither.

  `roundGrade` also guards binary float noise with a sign-aware epsilon — `1.005 * 100` is `100.49999999999999`, which would otherwise round down and cost a learner a grade step. **`gte(value, threshold, policy)`** rounds _both_ sides before comparing, so "what the learner sees" and "what the gradebook decides" are the same comparison. Modes: `half-up`, `half-even`, `floor`, `ceil`.

  `roundGrade` is **idempotent** for every mode: the float-noise allowance is applied in the direction each mode needs (`ceil` nudges down, `floor` nudges up, half modes nudge away from zero), so a value already exact at `dp` is never moved. A uniform away-from-zero nudge would make `ceil` climb a whole step each call — 0.7 to 0.71 to 0.72, and a true zero to 0.01 — which matters because a composed score is rounded once and then compared through `gte`, which rounds again.

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

## 0.3.1

### Patch Changes

- 69da998: Documentation-only clarifications to two v0.3 behaviours that changed silently for upgraders:

  - **Fill-in-the-blanks `caseSensitive` and `trimWhitespace` are classified `answer-key`** and are therefore removed by `redact()`. This is intentional — they describe how strictly the key is compared, so revealing them narrows the answer — but it changed the shape of redacted payloads on upgrade with no type error to warn you. If a renderer read those flags from a redacted payload, it now receives `undefined`. Use `redact(data, { policy: { blanks: { caseSensitive: 'public' } } })` if a deployment genuinely needs them client-side.
  - **`ScoringDetail.outcome` is optional in the type but always written** by both built-in scorers. It is a compatibility bridge so v0.2-era consumer-constructed literals keep compiling. **In v1.0 it becomes required and the deprecated `ScoringDetail.correct` is removed.** Migrate reads from `.correct` to `.outcome` now: `.correct` means "the learner acted correctly on this option", which for multiple-choice marks unselected distractors as `true`.

## 0.3.0

### Minor Changes

- a98f128: v0.3.0 — "close the holes, open the type system". Every change that touches grading semantics is opt-in: for identical `(data, response)` inputs, `score` / `passed` are bit-for-bit v0.2. Runtime-additive throughout; three TypeScript-surface notes for upgrading consumers:

  1. **`ActivityType` / `ActivityData` / `LearnerResponse` gain `'written-response'`.** Exhaustive `Record<ActivityType, T>` literals and `assertNever` switches need the new case (or `Partial<Record<…>>`).
  2. **`ScoringResult.feedback` may now be a string** where it was always `null` (only when the activity authored feedback), and `ScoringDetail` gains `outcome`/`weight` — deep-equality comparisons against hand-built results need updating. `outcome` is optional in the type (0.2-era literals keep compiling) but always written by both scorers.
  3. **Schema tightenings reject data that was always broken but previously validated:** duplicate option ids, duplicate `{{id}}` placeholders / blank ids (these silently corrupted partial scores), whitespace-only accepted answers (matched empty input), and dangerous media URL schemes. Components validate in dev only, so production rendering of legacy rows is unaffected — but run a validation sweep over stored content before wiring these schemas into an authoring save path. xAPI durations now carry centiseconds (`PT5.40S`, was `PT5S`).

  **New: written-response activity type (Req 22, wire-format byte-compatible).** `WrittenResponseData` / `WrittenResponseLearnerResponse` / `WrittenResponseDataSchema` (loose — unknown keys and sidecars survive validation verbatim), `countWords()` (canonical `\s+` split, hyphenated tokens count 1), `writtenResponseJsonSchema`. Grading is deferred: use `evaluate()`, not `score()`.

  **New: `evaluate(data, response): ItemOutcome`** — `'scored' | 'deferred' | 'unscorable'`. An ungraded written response returns `{ status: 'deferred', reason: 'requires_async_grading', partial: { withinWordBounds, wordCount } }` instead of a fake 0; an unregistered type returns `'unscorable'` instead of throwing. `score()` keeps its exact signature and now throws a typed `DeferredScoringError` for deferred-only types (previously the type didn't exist in the union at all).

  **New: activity-type registry (R1).** `defineActivityType` / `registerActivityType` / `getActivityTypeDescriptor` / `registeredActivityTypes`; `validateActivity`, `score`, `evaluate`, `redact`, and the new `jsonSchemaFor(type)` are registry-backed, so a consumer can register a custom activity type without an SDK release. `ActivityType` is now `keyof ActivityDataMap` and `LearnerResponseMap` exists — both open to TypeScript module augmentation.

  **New: `redact()` + `FieldPolicy` + `assertRedacted()` (R7).** Fail-closed, exhaustive redaction driven by per-type field policies: unclassified fields (including unknown passthrough keys) are never emitted, and `scoringStrategy`, answer keys, per-item hints' answers and authored pass/fail feedback are stripped. Learner-facing content survives — including the `questionHtml` / `passageHtml` / `promptHtml` rich-text sidecars an exam renderer needs, and the **rubric**, which tells a learner what they are being graded on. Default (`reveal: 'none'`) output validates against new strict redacted schemas (`RedactedMultipleChoiceDataSchema` etc.); `reveal: 'after-submit'` restores answer-key fields for review renders. Sensitivity is partly a pedagogical choice, so it is not frozen in the SDK: `redact(data, { policy: { rubric: 'author-only' } })` tightens any field per call.

  **New: `questionHtml` (multiple-choice) and `passageHtml` (fill-in-the-blanks)** as first-class optional fields, matching `promptHtml` on written-response. The SDK carries, validates and redacts them as learner-visible content but does not render them yet — components still escape text, and sanitisation remains the application's responsibility. Rendering lands with the controlled/redacted renderer in v0.4.

  **New: `matchText()` + `TextMatchPolicy` (R3.3).** Opt-in Unicode normalization (`NFC`/`NFKC`), diacritic folding, inner-whitespace collapse, punctuation tolerance, Levenshtein distance, and locale-aware case folding; `TextMatchResult.via` reports match quality. `BlankConfig.match` wires a policy into fill-in-the-blanks scoring; defaults are bit-for-bit the previous trim+lowercase semantics.

  **Fixed (verified against the external SDK audit):**

  - B1: `DEFAULT_PASS_THRESHOLD` (0.7) is now exported; the `.d.ts` JSDoc that claimed 0.6 (twice) is corrected.
  - B3: `score()`/`evaluate()` now select authored `ActivityFeedback` into `ScoringResult.feedback` keyed on `passed` — exactly the condition the components applied.
  - B4: `ScoringDetail.outcome` (`correct | incorrect | correct-omission | incorrect-omission`) replaces the ambiguous `.correct`, which is deprecated but still written.
  - B5: `ScoringDetail.weight` is now written (`1`) by both scorers.
  - B7: all schemas are loose (`z.looseObject`) — `validateActivity` no longer strips unknown fields, deleting the consumer's merge workaround. The exported JSON Schemas no longer emit `additionalProperties: false`, so the two validation paths finally agree.
  - B9: option ids must be unique; duplicate `{{id}}` placeholders and duplicate `blanks[].id` are rejected (each id appears exactly once — previously duplicates corrupted the partial-score denominator); MC option cap raised 10 → 26; accepted answers must be non-empty after trimming (a whitespace-only key used to mark empty input correct).
  - B10 (slice): `definition.interactionType` / `correctResponsesPattern` / `choices` and `context.contextActivities` are now expressible and validated; durations carry centisecond precision (`PT1.23S` — previously anything under 500 ms collapsed to `PT0S`).
  - Security: media URLs are scheme-allow-listed (`https:`/`http:`/`data:`/`blob:` + root-relative) — `javascript:`, `file:`, `ftp:` are rejected. Previously `javascript:alert(1)` validated and reached an iframe `src`. Root-relative URLs are newly allowed. **`embed` media is stricter still: absolute http(s) only** — a `data:`/`blob:`/same-origin document inside the allow-scripts embed iframe would defeat its sandbox.
  - Statement ids no longer require `crypto.randomUUID`: on non-secure (plain-http) origins a `getRandomValues`-based v4 fallback is used — previously every component crashed **at submit**, losing the learner's answer.
  - `assertRedacted` now fails closed when a type registers no `redactedSchema` (a marker alone proves nothing).
  - xAPI: new `SUBMITTED` verb (`http://activitystrea.ms/schema/1.0/submit`) and `xAPIBuilder.buildSubmittedStatement()` for deferred submissions — no `score`/`success`/`completion` fields, so an LRS can never mistake "submitted, ungraded" for a result.

  **Packaging:** `sideEffects: false`, `engines.node >= 20`, LICENSE now ships in the tarball.

  **Upgrading from an app-side `written-response` shim.** The activity payload is field-for-field identical (same names, casing and nesting), so **stored activity rows need no data migration**. Two caveats, because "no migration" is not the same as "nothing to do":

  - **`WrittenResponseDataSchema` is stricter than a typical hand-rolled shim.** New constraints that can reject rows a looser app-side check accepted: `minWords`/`maxWords` must be integers with `maxWords >= minWords`; `rubric.criteria` must be non-empty and each criterion needs a non-empty `name` (an authoring UI that adds a blank criterion row will trip this); `media` must satisfy the alt-text and URL-scheme rules. Run a validation sweep over stored content before wiring these schemas into a save path — the same advice as the multiple-choice / fill-in-the-blanks tightenings above.
  - **Deferred grading needs storage the SDK does not model yet.** `evaluate()` returns `{ status: 'deferred' }`, but there is no SDK type yet for the grade that comes back. Persisting a grade (per-criterion scores, corrections, confidence, human override) is still yours to design; a `GradeRecord` and a `graded` outcome are planned for v0.4.

  You can also delete any raw-payload merge workaround around `validateActivity` (unknown keys now survive validation) and import `DEFAULT_PASS_THRESHOLD` instead of duplicating the constant.

## 0.2.1

### Patch Changes

- ed4a77d: Add a per-package README so visitors to npmjs.com see a focused overview, install command, quick-start example, subpath-export map, and links to the full documentation. No runtime change.

## 0.2.0

### Minor Changes

- 9e24763: V1 feature set: Multiple Choice & Fill-in-the-Blanks activities, scoring engine,
  xAPI builder + `useXAPI`, `useActivityState`, `ThemeProvider` with an optional
  token-driven skin and `createTailwindTheme`, `ActivitySequence` question-set
  pager, optional per-activity `media` (image/audio/video/embed) and authored
  overall `feedback`, full WCAG 2.2 AA accessibility, and project documentation.
