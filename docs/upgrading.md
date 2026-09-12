# Upgrading

`lk-react` declares `lk-core` as a **peer** dependency, so every `lk-core` minor
forces a `lk-react` **major**. Some of those majors change no React API at all —
check the map before you plan a migration. (A `lk-core` *patch* does not force a
major, which is why 2.1.0 is a minor against `lk-core@0.3.1`. Install the pair
from one row: `lk-react@2.1.0` peers on `lk-core@^0.3.1`, not `^0.3.0`.)

| `lk-core` | `lk-react` | What landed |
|---|---|---|
| 0.3.0 | 2.0.0 | `<WrittenResponse>`, the activity-type registry, `evaluate()` / `ItemOutcome`, `redact()` |
| 0.3.1 | 2.1.0 | Controlled components (`value` / `defaultValue` / `onChange`), `renderMode`, redacted rendering, rich text |
| 0.4.0 | 3.0.0 | `composeAssessmentScore` + `RoundingPolicy`, `GradeRecord` and the deferred-grading return trip |
| 0.5.0 | 4.0.0 | Item groups + shared stimulus, the exam response channel (`onSubmit`), `slotId` on `onActivityComplete`, `xapiDefinitionFor`, opt-in rounded item threshold, `seededShuffle` v2 |
| 0.6.0 | 5.0.0 | `CriterionScore.maxScore`, per-type redacted types, `planAttempt`. **No React API change** — 5.0.0 is purely the peer bump |
| 0.7.0 | 6.0.0 | `AttemptState`, sequence resume & review, `defaultSubmitted`, `shuffleSeed` reaching the option shuffle |
| 0.8.0 | 7.0.0 | Media playback policy for listening papers: `media.playback` (`maxPlays` / `seek` / `rate` / `nativeControlHints`), the SDK's own audio transport, `MediaPlayLedger`, `mediaBudget` on the pager. **Also two new render-time throws and one grade-affecting match fix** — the only release in this table that asks you to do something |
| 0.8.1 | 7.0.1 | Patch: two further fail-open leaks in `redact()`, a play budget that never bound on an essay slot, and three guards that could not fail |
| 0.8.1 | 7.1.0 | `<LkIntlProvider>`: every string the SDK renders itself is overridable, `lang` / `dir` derived from the locale, RTL-safe skin. **No `lk-core` change** — a `lk-react` minor on the same peer range as 7.0.1 |
| 0.9.0 | 8.0.0 | Authoring: `validateDraft` (incomplete vs invalid), `createDraft`, per-type `authoring` descriptors, `<ActivityPreview>`. **Additive** — the major is the peer bump, plus one new component and two new strings |

Every behavioural change here is opt-in, per the
[grade-stability rule](./roadmap.md#5-standing-decisions) — with **one
exception, in 0.8.0**: a fuzzy-matching fix that stopped an *unanswered* blank
scoring as correct. That one changes a number, deliberately, because every mark
it changes was wrong. It is spelled out in
[0.7 → 0.8](#07--08-lk-core--6x--7x-lk-react). Everywhere else in this table, if
you upgrade and change no code, the numbers you record stay exactly what they
were.

- On **0.3.x / 0.4.x / 0.5.x**? Start with [Grade-correctness first](#grade-correctness-first).
- On **0.6.x**? Skip to [0.6 → 0.7](#06--07-lk-core--5x--6x-lk-react).
- On **0.7.x**? Skip to [0.7 → 0.8](#07--08-lk-core--6x--7x-lk-react) — it has two new render-time throws and one grade-affecting fix.
- On **0.8.x**? See [0.8 → 0.9](#08--09-lk-core--7x--8x-lk-react) — additive, with one possible type error.

---

## Grade-correctness first

*(Applies to any upgrade from `lk-core` 0.3.x, 0.4.x or 0.5.x. Each item names
the release it landed in — you may already have some of them.)*

Two of these changes are not features — they close paths that put a **wrong
number in front of a learner**, and both are things an integrating application
has to opt into by calling something.

### 1. Stop letting a model do the arithmetic *(0.6.0)*

**The problem.** A rubric-based AI grader is usually asked for a total as well
as per-criterion judgements — the prompt says *"score_0_100 is the weighted
total across the rubric criteria"* — and the returned total is stored. That
total is unverifiable and unreproducible: the same criterion scores can yield a
different total on a second run, and nobody can recompute the grade during an
appeal two years later.

**The fix.** Ask the model only for judgement. Do the arithmetic here:

```ts
import { gradeFromRubric, outcomeFromGrade } from '@intellectif/lk-core';

// Your grader returns per-criterion scores. It no longer returns a total.
const result = gradeFromRubric(
  [
    { name: 'Task achievement', score: 82, maxScore: 100, weight: 2 },
    { name: 'Grammar',          score: 71, maxScore: 100, weight: 1.5 },
    { name: 'Vocabulary',       score: 64, maxScore: 100, weight: 1.5 },
  ],
  activityData,               // optional: supplies passThreshold
);

if ('unscorable' in result) {
  // A broken grader is reported, never rounded down to a plausible zero.
  return markForHumanReview(result.reason);
}
recordGrade(outcomeFromGrade(result));
```

`maxScore` per criterion is **new in 0.6.0** (`lk-react` 5.0.0) and exists for
exactly this migration. Before it, `gradeFromRubric` required scores already scaled to
`[0,1]` and *rejected* a 0–100 grader outright, which is why teams kept the
model's own total. Declare what each score is out of — `100`, `9` for a CEFR
band, anything positive and finite — and the SDK normalises before weighting.
Omit it and the previous `[0,1]` behaviour is byte-identical.

The returned `GradeRecord.score` is always scaled `[0,1]`. Multiply by 100 at
your storage boundary if your columns are `0..100`.

### 2. Stop recording an ungraded essay as a zero *(0.4.0)*

**The problem.** When an async grade has not landed at submit time — the grader
failed, the network dropped, a cron will retry — the natural thing is to record
`0` and flag the attempt. But that zero flows into the section percentage and
into `passed`, so a learner is shown a fail for work nobody has marked yet.

**The fix.** `composeAssessmentScore` models this directly. An item whose
outcome is `deferred` is excluded from the denominator rather than counted as
zero, and the whole result reports as **provisional**:

```ts
import { composeAssessmentScore } from '@intellectif/lk-core';

const result = composeAssessmentScore(sections, {
  passThreshold: 0.6,
  sectionThreshold: 0.5,
  rounding: { mode: 'half-up', dp: 2 },   // required — the SDK picks neither for you
});

result.status;   // 'provisional' while anything is still awaiting a grade
result.passed;   // boolean — or null while provisional
result.pendingSlotIds;
```

**Do not record a `provisional` score as final.**

Two things to plan for when you adopt it:

- **`passed` is `boolean | null`.** It is `null` while the attempt is
  provisional, because an attempt with unmarked work has neither passed nor
  failed. If your `passed` column is `NOT NULL`, either make it nullable or keep
  the attempt in a pending state and write the column only once
  `status === 'final'`.
- **It consumes a list, not a count.** Every slot needs a `ScoredItem`,
  including unanswered ones, or the denominator silently shrinks and the
  remaining questions quietly become worth more than the paper says.

  Give an unanswered slot a **`deferred`** outcome — **not `unscorable`**. The
  two are not interchangeable. `unscorable` means *"a grade is never coming"*,
  so the slot leaves the denominator **and** the result is still allowed to go
  `final`: a three-question paper with one correct answer and two `unscorable`
  slots composes to a final, passing **100%**. `deferred` means *"not yet"*,
  which holds the result `provisional` so nothing can be recorded.

  Better still, do not build the list by hand. `scoredItemsFromPlan(plan,
  outcomes)` builds it from the frozen plan and defaults a missing outcome to
  `deferred` for exactly this reason. Pass `{ missing: 'zero' }` once you know
  the attempt was submitted and the blanks are genuinely blanks.

### 3. Stop re-implementing rounding *(0.4.0)*

`roundGrade`, `gte` and `classifyBand` are exported. If you maintain your own,
compare them before switching — and note one deliberate difference: the SDK
never turns a non-finite value into `0`. A `NaN` grade is a broken calculation,
and rounding it to a plausible zero hides the bug in a learner's record.

Where that non-finite value is *refused* depends on which function sees it.
`gradeFromRubric` reports `{ unscorable: true, reason }` and hands you a defect
to act on. `roundGrade` instead **passes the value through unchanged** — so
guard with `Number.isFinite` before you record, because `gte(NaN, 0.7)` is
`false` and `classifyBand(NaN, …)` is `null`: a broken calculation would
otherwise read as an ordinary fail.

Grade rounding and band classification are **two different operations**:
rounding is half-up (or whatever you configure) at a required `dp`; band
classification floors, because over-placement is the more harmful error. The SDK
ships no default for either.

---

## What else changed

### Types you no longer have to hand-write

`redact()` returns `RedactedActivityData`, which proves a payload is learner-safe
but says nothing about its shape. **New in 0.6.0:** per-type redacted types,
derived from the strict schemas with `z.infer`, so they cannot drift:

```ts
import type {
  RedactedActivity,               // discriminated union of all three
  RedactedMultipleChoiceData,
  RedactedFillInTheBlanksData,
  RedactedWrittenResponseData,
  RedactedStimulus,
} from '@intellectif/lk-core';
```

Use them for the payload your server sends an exam client, and for the props of
a renderer that must never see an answer key.

> **Known gap.** These are not yet assignable to the React components' `data`
> prop: `Renderable<T>` widens `scoringStrategy` but leaves nested answer-key
> fields (`options[].isCorrect`, `blanks[].acceptedAnswers`) required, so a real
> redacted payload still needs `asRenderable` / `asRenderableSequence`. Still
> open as of 0.7.0 / 6.0.0; tracked in the [roadmap](./roadmap.md).

### `lk-react` 4.x

- `ActivitySequence` gained **`onSubmit(response, { slotId, index, activityId })`** —
  in `exam` mode this is the *only* callback that fires, because the components
  never grade there. If you render an exam through the pager, you need it.
- `onActivityComplete` gained a third argument, `slotId`. Persist against that,
  not the presented index. Existing two-parameter handlers keep compiling.
- `SequenceItemOutcome` gained a `responded` arm — an exhaustive `switch` over it
  needs a new case.
- `activities` accepts item groups (`SequenceEntry[]`), and shuffling in
  `exam`/`review` mode now **requires** `shuffleSeed`.

### `@intellectif/lk-server` was deleted

It was an empty placeholder for its whole life. If you depended on it, you
didn't — nothing was ever published from it.

### `seededShuffle` gained a `version`

Version 1 (still the default) draws its Fisher–Yates index from an LCG's low
bits, which are correlated: on a four-option item only 12 of the 24 possible
orders are reachable, and the last authored option lands first 8% of the time
against 42% second. Version 2 draws from the high bits and reaches every order
uniformly.

The default does not change, because these permutations are a wire contract — a
stored attempt may hold only its seed, and a review render has to reproduce what
the learner actually saw.

> **Reachability caveat.** `{ version: 2 }` is accepted only on a **direct**
> `seededShuffle(items, seed, { version: 2 })` call. The SDK's own ordering
> paths — `flattenSequence`, `planAttempt`, within-group shuffling and
> `<MultipleChoice>`'s option order — always use version 1, and none of their
> option bags exposes the setting. Version 2 is therefore usable today only if
> you order content yourself before handing it to the SDK. Threading it through
> is tracked in the [roadmap](./roadmap.md).

---

## 0.8 → 0.9 (`lk-core`) / 7.x → 8.x (`lk-react`)

Additive. Upgrade and change no code, and nothing you render, validate or score
behaves differently. 8.0.0 is a major because `lk-core` is a peer and moved a
minor; it also adds one component.

### An editor can tell unfinished from wrong *(0.9.0 / 8.0.0)*

`validateDraft(type, draft)` reports `complete`, `incomplete` or `invalid`, with
issues that carry a `severity` and a `code`, documented for every problem the
draft checks recognise. `createDraft(type, { newId })`
returns an empty draft to start from, and `<ActivityPreview>` renders a draft in
any mode with a simulated response — or a notice, while it is unfinished. See
[Building an editor](./authoring.md#building-an-editor-v09).

If you keep draft checks of your own beside `validateActivity`, compare before
you replace them. `validateDraft` is stricter than the schema: it reports a blank
written-response `prompt` even when `promptHtml` is set, a rubric criterion name
that is only whitespace, and a rubric whose weights are all 0 or add up to more
than a number can hold. It does not adopt
rules that belong to a product rather than to the activity type: `minWords: 0`
(no lower limit) is complete, and a rubric weight above 1 is fine. If your
storage writes `null` for a field nobody filled in, expect `null_not_allowed`
wherever the field is optional: the schema accepts no `null` there, so leave the
field out.

### One thing that can stop a build *(8.0.0)*

`LkStrings` gained `previewIncomplete` and `previewInvalid`. A translation passed
as a partial override — an `LkStringsOverride`, or an object literal handed
straight to `strings` — is unaffected. A dictionary declared as a complete
`LkStrings` does not type-check until it supplies both.

## 0.7 → 0.8 (`lk-core`) / 6.x → 7.x (`lk-react`)

7.1.0 is additive: upgrade to it from 7.0.x and change nothing. **0.8.0 / 7.0.0
is not** — it closed two exam-integrity holes by turning them into render-time
throws, and fixed a match bug that can change a recorded grade. Those three are
first below; do them before anything else.

### Two things that now throw at render *(0.8.0 / 7.0.0)*

Both were exam-integrity guards watching the wrong door. Each threw open a path
that looked like it worked, which is why they are errors rather than warnings.

- **An unseeded item-level shuffle in `exam` / `review`.** `<ActivitySequence>`
  demanded a `shuffleSeed` for `shuffle="entries"` and for a group's
  `shuffle: 'within-group'`, but never for an activity's own `data.shuffle` —
  and `<MultipleChoice>` invents a per-mount seed when none reaches it. A single
  item with `shuffle: true` produced an order the server cannot rebuild.
  **Do:** pass `shuffleSeed={attemptId}` whenever any activity carries
  `shuffle`. Note the pager is exported without an error boundary of its own, so
  an unfixed paper fails whole rather than per item.
- **Redacted data in `<WrittenResponse renderMode="practice">`** (`practice` is
  the default). Its two siblings have refused this since 0.5.0. The asymmetry
  looked harmless because the component never scores locally — but `practice`
  still runs the submit path and emits a practice-mode xAPI statement for work
  the server is meant to grade. **Do:** render redacted essays with
  `renderMode="exam"` or `"review"`. Its own boundary contains this one to a
  single error card.

### One change that can move a recorded grade *(0.8.0)*

Levenshtein distance from an empty string is just the answer's length, so
`levenshtein: 1` on a one-letter blank — an article, or "I" — accepted an
**unanswered** blank: `matchText('', ['a'], { levenshtein: 1 })` returned
`{ matched: true, via: 'fuzzy' }`. Empty and whitespace-only input no longer
reaches the fuzzy stage at all; exact and normalized matching are untouched, so
an author who deliberately lists `""` as an accepted answer still gets it, one
stage earlier.

**Do:** if you have stored gap-fill grades under a `levenshtein` policy with
very short accepted answers, they are worth recomputing. Related hazard,
unchanged: `levenshtein: 1` against a one-character answer still accepts *any*
single character — that is what an edit distance of 1 means. Prefer exact
matching on single-letter blanks.

### Listening papers can now limit playback *(0.8.0 / 7.0.0)*

An audio `media` can declare `playback: { maxPlays, seek, rate }`. With any of
them set, the component renders the SDK's own accessible transport instead of the
browser bar and enforces the policy from the element's own events, so a hardware
media key goes through the budget too. A play budget survives a refresh **only**
if you persist it: wire `mediaBudget` on `<ActivitySequence>` and store what
`onPlayConsumed` reports. The SDK remembers nothing.

`nativeControlHints` is advisory by design — it emits `controlsList`, which some
engines ignore and which never prevents a download. Use signed, expiring URLs if
the file itself must not be kept.

### The UI speaks your language *(7.1.0)*

Every string the SDK renders itself — 50 of them — is replaceable through
`<LkIntlProvider>` or a per-component `strings` prop, and the provider sets `lang`
and derives `dir` from the locale. **Only English is bundled**; the mechanism
ships and the translations are yours.

If you already pass `mediaStrings` or `mediaBudget.strings` (7.0.0), keep them:
they still work, and they still win over the provider for the transport. The
English defaults are byte-identical to 7.0.1, so a tree with no provider is
unchanged. See [Internationalisation](./i18n.md).

## 0.6 → 0.7 (`lk-core`) / 5.x → 6.x (`lk-react`)

Everything here is additive; no existing call changes meaning. Three things do
need a decision, and they are listed at the end.

### Resuming an interrupted attempt

Before 0.7, the pager's position and per-slot answers were the one part of an
attempt a consumer could not restore: a learner at question 18 of 20 whose tab
crashed came back to question 1 with all twenty blank, however faithfully the
responses had been persisted. If you built your own renderer to work around
that, this is the release that lets you delete it.

```ts
import { serializeAttemptState, restoreAttemptState, diffResponses } from '@intellectif/lk-core';

const snapshot = serializeAttemptState(plan, {
  responses,          // { [slotId]: LearnerResponse }
  submittedSlotIds,
  index,              // where the learner is standing
  savedAt: new Date().toISOString(),   // the SDK reads no clock
});

const restored = restoreAttemptState(plan, snapshot);   // throws unless it is this paper
```

The `planHash` check is the point. Slot ids are short and stable by design
(`"0"`, `"1.0"`), so a snapshot from a *different* paper — last term's midterm, a
sibling version, a copy-pasted attempt row — lines its answers up against the
wrong questions and looks entirely plausible doing it. Validation happens on the
way **in** as well as out: a response recorded against a slot the paper does not
contain is a bug at the moment it is written.

`diffResponses(before, after)` reports what moved between two snapshots,
including an answer the learner **cleared** — which comparing the later snapshot
alone cannot see. Use it for a delta autosave or an audit trail.

Then feed it to the pager:

```tsx
<ActivitySequence
  activities={entries}
  shuffleSeed={attemptId}
  defaultIndex={restored.index}
  responses={restored.responses}
  submittedSlotIds={restored.submittedSlotIds}
  onIndexChange={(index) => save({ index })}
  onSubmit={(response, slot) => save({ [slot.slotId]: response })}
/>
```

The seed props are read at **mount only**, and seeding stops at the first set
change — to show a different attempt, remount with a `key`. `submittedSlotIds`
is what keeps a summative resume honest: without it every question the learner
had already committed reopens as answerable.

For a finished attempt, pass `renderMode="review"` with the server's `outcomes`
keyed by `slotId`. The client never scores, so without `outcomes` a review render
shows the answers and no verdict rather than inventing one.

### Three things to decide

- **`SequenceItemOutcome` gained a `restored` arm.** An exhaustive `switch` over
  it needs a new case. (A slot restored as already-submitted mounts locked and
  fires no callback — previously that left `onFinished` waiting forever on
  something that could never arrive.)
- **`shuffleSeed` now reaches each item's option order.** It was forwarded to
  `flattenSequence` for question order only, so `MultipleChoice` invented a fresh
  per-mount order and a review render showed the learner's answers against a
  different arrangement than the one they sat. Option order for existing seeded
  content therefore changes once — from *unreproducible* to *reproducible*. If you
  stored the presented order alongside an attempt, compare before you rely on it.
- **`MultipleChoice` now resets to `defaultValue`, not to empty**, when its `data`
  prop changes identity — matching what `FillInTheBlanks` already did. This
  matters if you build entries in render (`activities={raw.map(redact)}`, the
  documented exam pattern): that hands over new objects every render, and clearing
  wiped every restored answer on the first unrelated re-render. If you relied on a
  `data` swap to clear answers, change the React `key` instead.

`defaultSubmitted` is also new on every activity component, and
`useActivityState(initialState?)` takes a starting state with `reset(to?)` taking
the state to return to — both exist so the submitted half of an attempt is
restorable outside the pager too.
