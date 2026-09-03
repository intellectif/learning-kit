---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

Shared stimulus and item groups — the reading/listening-comprehension container.

**The gap was a container, not an item type.** Real comprehension content is one passage or recording serving several questions; with nowhere to put the passage, it ended up hidden behind a toggle or pasted into every item. `Stimulus` and `ItemGroup` are that container, modelled as **content** so they drop into a sequence, a lesson quiz or an exam section alike. `kind` is enforced (a `text` stimulus needs a body, an `audio` one needs audio media, a `video` one accepts an embed), `bodyHtml` requires the plain `body` it falls back to, and `transcript` is the one author-only field. `validateItemGroup` validates the container, the stimulus and every item against its registered schema, reporting an unregistered item type rather than throwing — an author fixing a six-item group wants every problem listed.

**Ordering lives in lk-core, so the server and the client agree.** `flattenSequence(entries, { shuffleEntries?, seed? })` turns activities and groups into presented slots. Groups are **shuffle-atomic** — a section shuffle moves a group as one block and never interleaves two passages' questions — and only a group that declares `shuffle: 'within-group'` reorders its items. A seed is **required** whenever anything shuffles, and an **empty group is refused**: contributing no slots would delete a whole section from a sequence that still looked well-formed, and `composeAssessmentScore` would then report a `final` grade over the survivors. Each slot's `slotId` comes from the *authored* position, so it is unique and stable under shuffling.

**Redaction.** `redactItemGroup` / `assertRedactedItemGroup` extend the fail-closed model to the container: the transcript goes, the passage stays, every item is proven learner-safe against its own type's schema, and failures are reported at `items.<index>`. `item-group` is reserved in the registry.

**React.** `ActivitySequence` accepts `SequenceEntry[]`, flattens groups into consecutive questions, and mounts each group's stimulus **once**, kept beside every question in the group. New `shuffle`, `shuffleSeed`, `sanitizeHtml` and `onSubmit` props; new `<StimulusPanel>`, also exported for custom runners.

---

The rest of this entry is what a review of the above turned up. Several are older defects the group work only made visible.

**`ActivitySequence` had no exam response channel at all.** In `exam` mode the components deliberately never grade: they emit the raw answer through `onSubmit` and return before `onComplete`. The pager forwarded `onComplete` and nothing else, so an exam runner received *nothing* — no response, no completion, for any question. `onSubmit(response, { slotId, index, activityId })` is new and fires in every mode before grading, and an exam slot now records a `responded` outcome so `onFinished` reports the finished set instead of never firing. (`SequenceItemOutcome` gains that third arm, so an exhaustive `switch` over it needs a new case.)

**Hiding a pane did not stop its media.** The pager keeps every question and stimulus mounted so answers survive back-navigation, and toggles visibility with `hidden` — which is `display: none`, and CSS does not touch playback. A recording started for one question carried on underneath the next, its controls removed from the page and from the accessibility tree, with no way to stop it but navigating back. Panes now pause their `<audio>`/`<video>` as they hide, preserving `currentTime`: a recording keeps its position between questions of its own group, stops on the way out, and never auto-resumes. A provider `embed` cannot be controlled this way and is documented as such. This affected per-question media too, since before item groups existed.

**Navigation put focus on the passage, not the question.** The stimulus was rendered inside the region labelled "Question 3 of 5", ahead of the question, so every Next dropped focus onto a landmark that began with the whole passage, keyboard users tabbed through it (audio controls included) before reaching the question, and a region sat nested inside a region. The stimulus is now a sibling of the question region: same visual order, still a landmark to jump back to, focus lands on the question.

**`onActivityComplete` could not identify what it had completed.** It reported the *presented* index, which moves under shuffling and already differs from the slot identity once a group is present — while `composeAssessmentScore` keys on `slotId`, so persisted rows could not be reconciled with the grade. It now receives `slotId` as a third argument (existing two-parameter handlers keep compiling).

**A reordering set change could leave a sequence unfinishable.** Changing the presented order cleared the recorded outcomes but left the children mounted under unchanged keys — and therefore still `completed`. Those slots could not be answered again and nothing would refill them, so the set could never finish. A reset now resets both halves.

**Same-tick completions could be lost.** Outcomes were read from a `useState` closure, so two slots completing in one tick both saw the pre-update array and the second overwrote the first. They are held in a ref, written synchronously.

**Redacted groups did not type-check into the pager**, and the obvious fix does not work: `Renderable<T>` is built on `Omit`, which does not distribute over a union, so `Renderable<ActivityData>` collapses to the fields every activity shares and `.type` stops narrowing — widening the prop to it would have broken the pager's own dispatch and every custom renderer. `RenderableActivity` distributes properly (and fixes `ActivityProps`, where custom renderers could not narrow `data` either), and `asRenderableSequence` is the single documented crossing for `RedactedActivityData`, whose all-`unknown` fields satisfy no widening at all.

**`FillInTheBlanks` accepted redacted data in `practice` mode.** It would then call `score()` from the submit handler — where React error boundaries cannot reach — throwing after the learner had typed their answers. It now fails at render like `MultipleChoice` already did.

**`seededShuffle` gains an opt-in `version`.** Version 1 takes the Fisher–Yates index from its generator's low bits, which in an LCG are strongly correlated: on a four-option item only 12 of 24 orders are reachable *for any seed*, and the last authored option lands first 8% of the time against 42% second — a real fairness defect on an exam. Version 2 draws from the high bits and reaches every order uniformly. **Version 1 remains the default**, because the permutations are a wire contract: an attempt may be stored with only its seed, and a review render must reproduce what the learner saw, so changing the default is a package major. Use `{ version: 2 }` for new content.

**A stimulus no longer lends its language to the SDK's own text.** `lang` was set on the whole panel, so a screen reader read this package's English strings — the region's name, "Questions 3–5" — in the passage's voice (WCAG 3.1.2). It is now declared on the authored parts only.
