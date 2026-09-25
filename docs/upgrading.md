# Upgrading

`lk-react` declares `lk-core` as a **peer** dependency, so until 1.0 every
`lk-core` minor forced a `lk-react` **major**. Some of those majors change no
React API at all — check the map before you plan a migration. **From `lk-core`
1.0.0 / `lk-react` 23.0.0 that stops:** a `lk-core` minor or patch releases no
`lk-react`, and you upgrade `lk-core` on its own. See [Stability](./stability.md). (A `lk-core` *patch* does not force a
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
| 0.10.0 | 9.0.0 | `gap-select` (the dropdown cloze) and multiple-choice option `media`. **Additive** — the peer bump |
| 0.10.1 | 10.0.0 | `<GapSelect>`, the renderer the type shipped without; `GapSelectData` and friends exported. Two new strings |
| 0.11.0 | 11.0.0 | Node 22 is the floor, and `engines` says so. **No API change** |
| 0.12.0 | 12.0.0 | `validateItemGroupDraft` / `createItemGroupDraft`: a testlet's own draft contract. **No React API change** — the peer bump |
| 0.13.0 | 13.0.0 | `dictation`: `<Dictation>`, `alignDictation`, `diffDictationChars`, `dictationReferenceWords`, `ScoringDetail.score`, an optional `{ rounding }` on `score()` / `evaluate()`, `dictationType` / `gapSelectType` on the barrel, the dictation draft contract. **Additive** — the major is the peer bump, plus one new component and the dictation strings |
| 0.14.0 | 14.0.0 | `read-aloud`: `gradeReadAloud`, `inspectWav`, `validateSpeechAssessment`, `alignReadAloud`, `outcomeFromUnscorable`; `<ReadAloud>`, `<PronunciationFeedback>`, `useSpeechRecorder`, and `recordingBinding` / `assessments` on `<ActivitySequence>`. **Additive, with one pager fix for every type** — the major is the peer bump plus two components and a hook, and a sequence now refuses an outcome that belongs to a paper it has since been handed |
| 0.14.1 | 14.1.0 | Read-aloud follow-ups: a resumed play that bypassed a play budget, recording under a strict Content-Security-Policy, and a production check in the xAPI validators. **No API removed** |
| 0.15.0 | 15.0.0 | Interactive video: `timeline` on an item group, `readMediaProgress`, `composeTimelineScore`, the `ig_timeline_*` codes; `<InteractiveVideo>`. **Additive** — the major is the peer bump, plus one component and its strings |
| 0.16.0 | 16.0.0 | Two caption languages at once in `<InteractiveVideo>`, `defaultPreferences` and `onPreferencesChange`, `resolveCaptionTracks`. **One tightened rule**: a caption or subtitle track on a dictation's recording, or on a stimulus a dictation plays, is now refused as `captionsUrl` always was. **And one DOM change**: captions sit in a `.lk-iv-captions` container |
| 0.16.0 | 16.1.0 | `renderQuestion` on `<InteractiveVideo>`: a host draws a video's questions itself, and the video still keeps count. **No `lk-core` change** — a `lk-react` minor on the same peer range as 16.0.0. **One behaviour change**: Finish waits for a read-aloud take still being stored |
| 0.17.0 | 17.0.0 | AI help for learners: explanations and hints through ports you supply, `LkAiProvider`, the author's `ai` switch, and the AI contract in lk-core (`buildAiFacts`, `aiExplanationRequest`, `aiHintRequest`, `checkAiExplanation`, `checkAiHint`, `hintRevealsAnswer`). **One tightened rule**: a field named `ai` must now be `{ hints?, explanations? }` |
| 0.18.0 | 18.0.0 | The grade return trip checks its numbers: `outcomeFromGrade` refuses a record that cannot be a grade (`deferred` / `grade_rejected`, the record kept on `rejectedGrade`), `composeAssessmentScore` holds such a slot `provisional` and names it in `rejectedSlotIds`, `gradeFromRubric` refuses a negative weight or an overflowing weight sum, and `aiExplanationRequest` explains no such grade. **Moves recorded grades, for invalid numbers only** — see [0.17 → 0.18](#017--018-lk-core--17x--18x-lk-react). **No React API change** — 18.0.0 is the peer bump |
| 0.18.0 | 18.1.0 | Host-renderer parity in `<ActivitySequence>`: a `renderers` override is handed a `question` (`active`, `setPending`, `portalContainer`, `clear`, `emit`, `slot`), and every call it is given keeps one identity. New hooks `useAiHints` / `useAiExplanation` for AI help in a question you draw. **No `lk-core` change** — a `lk-react` minor on the same peer range as 18.0.0 |
| 0.19.0 | 19.0.0 | AI groundwork: `AiTextResult.usage` (what a call cost, carried to `ai-hint-shown` / `ai-explanation-shown`), the new `ai-help-refused` interaction, and `@intellectif/lk-core/ai-check` — a kit that runs your AI prompts against the SDK's own checks in CI. The empty `@intellectif/lk-ai` placeholder is deleted. **Additive** — the major is the peer bump, plus one new interaction kind |
| 0.20.0 | 20.0.0 | Delivery policies: `delivery` on every activity and both pagers switches off feedback, solutions, hints or AI help per paper; `resolveDeliveryPolicy`, `validateDeliveryPolicy`, `combineDeliveryPolicies`; `planAttempt(…, { delivery })` records it in the plan and its hash, and `verifyAttemptPlan` reports `deliveryChanged`. **No grade changes, and an absent policy changes nothing** — the major is the peer bump, plus a required `delivery` on `InteractiveVideoQuestion` |
| 0.21.0 | 21.0.0 | Scoring policies: `scoring` on every activity and both pagers — "Try again" in `practice` (`retries`), which try `counts`, and what tries and hints cost (`retryPenalty`, `hintPenalty`); `scoreTries`, `evaluateTries` and `evaluate(…, { scoring })`; `resolveItemScoringPolicy` / `validateItemScoringPolicy`; `planAttempt(…, { scoring })` and `scoringChanged`; `hintsRevealed` on multiple-choice, fill-in-the-blanks and gap-select responses. **No grade changes without a policy.** One fix to 0.20's `solutions: false` on a dictation, and one possible type error — see [0.20 → 0.21](#020--021-lk-core--20x--21x-lk-react) |
| 0.22.0 | 22.0.0 | Feedback on writing: a `writingFeedback` port gives `<WrittenResponse>` "Get feedback on my draft" in `practice`; `useAiWritingFeedback` for a written response you draw; `aiWritingFeedbackRequest` and `checkAiWritingFeedback` in lk-core, which refuses a correction of words the draft does not contain (`misquotes-answer`) and computes the rubric's indicative score itself; four writing cases in `ai-check`. **Additive, and nothing changes without the port** — the major is the peer bump, plus eight strings and the type errors in [0.21 → 0.22](#021--022-lk-core--21x--22x-lk-react) |
| 1.1.0 | 23.1.0 | Coaching on a reading: a `pronunciationCoaching` port gives `<ReadAloud>` and `<PronunciationFeedback>` "Coach me on this reading" under the marks; `useAiCoaching` for marks you draw; `aiCoachingRequest` and `checkAiCoaching` in lk-core, which refuses coaching on a word the engine did not mark or a sound it did not report (`contradicts-marks`); four reading cases in `ai-check`. **Additive, and nothing changes without the port** — install both together; see [1.0 → 1.1](#10--11-lk-core--230--231-lk-react) |
| 1.0.0 | 23.0.0 | **1.0: what stays stable, written down** — see [Stability](./stability.md). A `lk-core` minor no longer releases a `lk-react` major. `ScoringDetail.correct` is removed and `outcome` required; zod is private — no export is a zod schema, `validateMedia` / `validateOptionMedia` replace the two a media picker used, and the `Redacted*` types are written out; a type you register takes a [Standard Schema](https://standardschema.dev), which a zod 4 schema already is. **No grade changes** — see [0.22 → 1.0](#022--10-lk-core--22x--23x-lk-react) |

Every behavioural change here is opt-in, per the
[grade-stability rule](./roadmap.md#5-standing-decisions) — with **two
exceptions**. In 0.8.0, a fuzzy-matching fix stopped an *unanswered* blank
scoring as correct; it is spelled out in
[0.7 → 0.8](#07--08-lk-core--6x--7x-lk-react). In 0.18.0, a grade whose numbers
cannot be a grade — `NaN`, 85 "out of 1", a score out of 0 — stopped composing
to a final result; see [0.17 → 0.18](#017--018-lk-core--17x--18x-lk-react). Both
change numbers, deliberately, because every result they change was wrong.
Everywhere else in this table, if you upgrade and change no code, the numbers
you record stay exactly what they were.

- On **0.3.x / 0.4.x / 0.5.x**? Start with [Grade-correctness first](#grade-correctness-first).
- On **0.6.x**? Skip to [0.6 → 0.7](#06--07-lk-core--5x--6x-lk-react).
- On **0.7.x**? Skip to [0.7 → 0.8](#07--08-lk-core--6x--7x-lk-react) — it has two new render-time throws and one grade-affecting fix.
- On **0.8.x**? See [0.8 → 0.9](#08--09-lk-core--7x--8x-lk-react) — additive, with one possible type error.
- On **0.9.x – 0.12.x**? See [0.12 → 0.13](#012--013-lk-core--12x--13x-lk-react) — additive, with the type errors it lists. The releases in between add the same kinds: `gap-select` joined the activity unions in 0.10.0, `gapLabel` and `gapPlaceholder` joined `LkStrings` in 10.0.0, and 0.11.0 needs Node 22 or later.
- On **0.13.x**? See [0.13 → 0.14](#013--014-lk-core--13x--14x-lk-react) — additive, with the type errors and the behaviour changes it lists.
- On **0.14.x**? See [0.14 → 0.15](#014--015-lk-core--14x--15x-lk-react) — additive.
- On **0.15.x**? See [0.15 → 0.16](#015--016-lk-core--15x--16x-lk-react) — one tightened dictation rule to check your content against, and one caption DOM change; 16.1.0 adds one Finish change.
- On **0.16.x**? See [0.16 → 0.17](#016--017-lk-core--16x--17x-lk-react) — one tightened rule for a field named `ai`, and eleven new strings.
- On **0.17.x**? See [0.17 → 0.18](#017--018-lk-core--17x--18x-lk-react) — a returned grade that cannot be one no longer composes to a final result; look for stored grades it now reports.
- On **18.0.x**? See [18.0 → 18.1](#180--181-lk-react) — additive, with one possible type error.
- On **18.1.x**? See [0.18 → 0.19](#018--019-lk-core--18x--19x-lk-react) — additive: what an AI call cost, a refusal you can watch, and a kit for your prompts.
- On **19.0.x**? See [0.19 → 0.20](#019--020-lk-core--19x--20x-lk-react) — nothing changes until you pass a policy; one possible type error.
- On **20.0.x**? See [0.20 → 0.21](#020--021-lk-core--20x--21x-lk-react) — no grade moves until you pass a scoring policy; a dictation under `solutions: false` stops naming the words it corrects; one possible type error.
- On **21.0.x**? See [0.21 → 0.22](#021--022-lk-core--21x--22x-lk-react) — additive: feedback on a draft appears only once you pass a `writingFeedback` port; the type errors it can cause.
- On **22.0.x**? See [0.22 → 1.0](#022--10-lk-core--22x--23x-lk-react) — no grade changes; what can stop a build, and the one read of stored data to check.
- On **23.0.x**? See [1.0 → 1.1](#10--11-lk-core--230--231-lk-react) — additive: coaching appears only once you pass a `pronunciationCoaching` port.

---

## 1.0 → 1.1 (`lk-core`) / 23.0 → 23.1 (`lk-react`)

Coaching on a reading aloud: a model explains the speech engine's marks, and the SDK refuses coaching
on anything the engine did not mark. See [Coaching on a reading](./ai.md#coaching-on-a-reading).
**Nothing changes until you pass a `pronunciationCoaching` port**, and no grade changes: the corpus
replays unchanged.

**Install both.** lk-react 23.1.0 calls lk-core's new `aiCoachingRequest` and `checkAiCoaching`, so its
peer range is `^1.1.0`. lk-core 1.1.0 on its own changes nothing for a lk-react 23.0 page.

What can stop a build, as [Stability](./stability.md#the-public-api) allows a minor:

- **`AiFeature` gains `'pronunciation-coaching'`, `AiRefusal` gains `'contradicts-marks'`, and
  `InteractionKind` gains `'ai-coaching-shown'`.** A `switch` over one of them without a `default`
  branch stops compiling; add the case, or a `default`.
- **`LkStrings` gains six keys**: `aiCoaching`, `aiCoachingLoading`, `aiCoachingHeading`,
  `aiCoachingUnavailable`, `aiCoachingWords` and `aiCoachingSound(expected, heard)`. A translation
  typed as a complete `LkStrings` needs them; one passed as an override does not. See
  [i18n](./i18n.md#ai-help).
- **`AiCheckCase` gains coaching cases.** `aiCheckCases()` returns four more, with
  `feature: 'pronunciation-coaching'` and an `AiCoachingRequest`; code that reads `request` without
  narrowing on `feature` sees the wider union. A run without a `pronunciationCoaching` port skips
  them.

`<PronunciationFeedback>` takes four new props — `ai`, `renderMode`, `delivery` and `onInteraction` —
all for coaching, and its `data` may now carry the item's `id`, `title`, `instructions` and `ai`. The
marks render as before in every mode. For coaching, pass the whole item as `data`: without an `id`
and a `title` none is offered, and a development build says so when a port is in force.

**Where it appears**, if you pass the port: in `practice` once a take is graded, and in `review`
wherever marks are shown. Never in `exam`. The author's `ai: { explanations: false }` and the paper's
`ai: { explanations: false }` or `feedback: false` switch it off; `solutions: false` does not, since
a reading hides no answer. If you give explanations but do not want coaching, leave the port out.

---

## 0.22 → 1.0 (`lk-core`) / 22.x → 23.x (`lk-react`)

1.0 is the stability release: [Stability](./stability.md) sets out what every 1.x keeps. **No grade
changes**: the grade-stability corpus replays unchanged but for the removed `correct` flag below.

### From now on *(1.0.0 / 23.0.0)*

A `lk-core` minor or patch releases no `lk-react`: `lk-react` 23 peers on `lk-core@^1.0.0`. When a
`lk-react` release needs a newer `lk-core`, its notes say which.

### What can stop a build *(1.0.0 / 23.0.0)*

- **`ScoringDetail.correct` is gone, and `outcome` is required.** `correct` was deprecated in 0.3: on a
  multiple-choice option it meant "the learner acted rightly on it", so an unchosen wrong option read
  `true`. Read `outcome` (`correct`, `incorrect`, `correct-omission`, `incorrect-omission`). The SDK no
  longer writes `correct`; a detail you stored before 0.3 carries only `correct`, so where you read
  stored details, read it off the stored value:

  ```ts
  const right = detail.outcome === undefined
    ? (detail as { correct?: boolean }).correct === true
    : detail.outcome === 'correct';
  ```

  The SDK's own components still read such a detail. A test that builds a detail with `correct` needs it
  removed.
- **No zod schema is exported.** zod is private to `lk-core`: a zod major is no longer a `lk-core` major,
  and your app can use any zod, or none. What replaces the schemas:

  | Before | 1.0 |
  |---|---|
  | `MediaSchema.safeParse(value)` | `validateMedia(value)` |
  | `MultipleChoiceOptionMediaSchema.safeParse(value)` | `validateOptionMedia(value)` |
  | `XDataSchema.safeParse(item)` | `validateActivity(type, item)`, or `validateDraft` in an editor |
  | `ItemGroupSchema.safeParse(group)` | `validateItemGroup(group)` |

  The validators return `{ success: true, data }` or `{ success: false, errors }`, each error with a
  `path`, a `code` and a `message` — `errors` where zod had `error.issues`. lk-core pins zod to one
  exact version, so if your app uses another, your bundle carries two copies. The `*JsonSchema` constants
  stay, typed `Record<string, unknown>` instead of zod's JSON Schema type. If you used a schema this
  table does not replace, open an issue saying what for.
- **A type you register takes Standard Schemas.** `ActivityTypeDescriptor.schema` and `redactedSchema`
  are `StandardSchemaV1` rather than `z.ZodType`. A zod 4 schema is one as written, so drop an
  `as unknown as z.ZodType<…>` cast. `registerActivityType` now throws on a value that is not a
  Standard Schema, and `jsonSchemaFor(yourType)` needs the descriptor's new `jsonSchema` unless the
  schema produces JSON Schema itself, as zod 4.6 does. See
  [Custom activity types end to end](./authoring.md#custom-activity-types-end-to-end).
- **The `Redacted*` types are written out** instead of inferred from zod schemas. They describe the same
  shapes, pinned to the schemas by a compile-time test; a type error here means your code reached zod's
  types through them.

### What can change behaviour *(1.0.0)*

- **Built on zod 4.6**, where 0.x used the zod 4 preview inside zod 3.25. Every built-in validation —
  items, drafts, item groups, speech assessments, redaction and xAPI statements — was run against
  0.21.0 on the same 28,000 inputs, and each accepts and refuses exactly what it did. Two changes in
  zod 4.6 would have altered that, and the SDK now decides both itself: string limits count UTF-16
  units, as they always have, where zod 4.6 counts code points; and a check never reads a field that
  failed validation, which zod 4.6 would have handed it. What is left is in two error lists, each one
  error shorter: a speech assessment with a string where a list of phonemes or syllables belongs, and
  an xAPI statement whose actor's `mbox` is not a `mailto:` address, are refused with one error, not
  two.
- **A registered type whose schema comes from another library than zod** reports, in a draft, every
  `null` at the path of a failure as `null_not_allowed`.

---

## 0.21 → 0.22 (`lk-core`) / 21.x → 22.x (`lk-react`)

### Feedback on a draft *(0.22.0 / 22.0.0)*

Pass a `writingFeedback` port — on `<LkAiProvider>`, or as `ai` on a component or a pager — and a
written response in `practice` offers "Get feedback on my draft" before submit. The learner revises
and asks again, up to `maxWritingFeedback` times (3 by default, at most 10). **Nothing changes until
you pass the port**: no button, no request, and the same DOM. See
[Feedback on writing](./ai.md#feedback-on-writing).

It follows the switches an explanation follows: the author's and the paper's `ai: { explanations:
false }` switch it off, and it needs the paper's `feedback` and `solutions`. Never in `exam` or
`review`. If you give explanations but do not want writing feedback, leave the port out.

**Run the check on your server too** — `checkAiWritingFeedback(result, request)` — before you log
feedback as shown. It anchors each correction in the draft, refuses one that quotes words the draft
does not contain, attaches the rubric's weights and computes the indicative score. Add a
`writingFeedback` port to your `runAiCheck` call and its four writing cases run with the rest.

### What can stop a build *(0.22.0 / 22.0.0)*

- **`AiFeature` gains `'writing-feedback'`, and `AiRefusal` gains `'misquotes-answer'`.** An
  exhaustive `switch` over either, or a `Record<AiRefusal, …>`, needs the new member. So does code
  that reads `ai-help-refused`'s `feature` as `hint` or `explanation` only.
- **`AiCheckCase.feature` can be `'writing-feedback'`, and `AiCheckCase.request` can be an
  `AiWritingFeedbackRequest`**, which carries no `grade` and whose `facts` are a written response's.
  Narrow on `feature` before reading `request.grade` or the facts of a scored type.
- **`LkStrings` gains eight keys.** An override (`LkStringsOverride`) needs no change; a complete
  `LkStrings` object of your own needs them — see [AI help](./i18n.md#ai-help).

---

## 0.20 → 0.21 (`lk-core`) / 20.x → 21.x (`lk-react`)

### Tries, and what hints cost *(0.21.0 / 21.0.0)*

`scoring` on any activity, on `<ActivitySequence>` or on `<InteractiveVideo>` gives a practice
question more tries, chooses which counts, and charges for tries and hints. **No grade moves until
you pass one** — an absent or empty policy scores exactly as now. See
[Scoring policies](./scoring.md).

**One thing is new without a policy:** a `practice` answer on which a learner was shown a hint says
how many — `hintsRevealed` on multiple-choice, fill-in-the-blanks and gap-select responses, as
dictation's already did — and `onChange` reports it when a hint is shown. A server that rebuilds a
response field by field drops it harmlessly; keep it if you mean to charge for hints there, with
`evaluate(item, response, { scoring })`.

**Record the policy with the attempt** — `planAttempt(entries, { seed, delivery, scoring })`. A plan
made without one is unchanged, `planHash` included.

### A fix to `solutions: false` on a dictation *(21.0.0)*

In 20.0.0 a dictation under `delivery={{ solutions: false }}` hid "Show solution" but its marks still
named every word it corrected — "“cta” should be “cat”", "“cat” is missing" — and drew the right
letters in its character diff: the answer, on a paper meant to be sat again. Where the right answer
may not show, the marks now say "“cta” is wrong" and "A word is missing", and draw no diff. Nothing
changes where solutions show. Two new strings carry it: `dictationWordWrongUnnamed` and
`dictationWordMissingUnnamed`.

### One possible type error *(21.0.0)*

`InteractiveVideoQuestion` gains a required `scoring` field, as it gained `delivery` in 20.0.0.
`renderQuestion` is handed it and needs no change; a question you construct by hand needs one:

```ts
import { DEFAULT_ITEM_SCORING_POLICY } from '@intellectif/lk-core';
const question: InteractiveVideoQuestion = { ...rest, scoring: DEFAULT_ITEM_SCORING_POLICY };
```

`LkStrings` gains nine keys. An override (`LkStringsOverride`) needs no change; a complete `LkStrings`
object of your own needs them — see [Tries and what they cost](./i18n.md#tries-and-what-they-cost).

---

## 0.19 → 0.20 (`lk-core`) / 19.x → 20.x (`lk-react`)

### A school decides what a learner sees *(0.20.0 / 20.0.0)*

`delivery` on any activity, on `<ActivitySequence>` or on `<InteractiveVideo>` takes away what a mode
would show: `feedback`, `solutions`, `hints`, and the `ai` switches. **Nothing changes until you pass
one** — an absent or empty policy is exactly what you have now. See [Delivery policies](./delivery.md).

**One behaviour to know:** the author's fill-in-the-blanks hints are on in `exam`, as they always
have been — an authored hint is part of the item, the same for every learner. Where yours are help
rather than part of the question, pass `delivery={{ hints: false }}` on those papers.

**Record the policy with the attempt** — `planAttempt(entries, { seed, delivery })` — and deliver the
attempt under the policy the plan recorded. A plan made without one is unchanged, `planHash`
included, so nothing you have stored moves.

### One possible type error *(20.0.0)*

`InteractiveVideoQuestion` gains a required `delivery` field. `renderQuestion` is handed it and needs
no change; a question you construct by hand — in a test, say — needs one:

```ts
import { OPEN_DELIVERY_POLICY } from '@intellectif/lk-core';
const question: InteractiveVideoQuestion = { ...rest, delivery: OPEN_DELIVERY_POLICY };
```

---

## 0.18 → 0.19 (`lk-core`) / 18.x → 19.x (`lk-react`)

### What a call cost, and what was refused *(0.19.0 / 19.0.0)*

Nothing here changes what a learner sees. It changes what you can know about it.

- **Put `usage` on what your port returns** and it reaches `onInteraction` beside the provenance:

  ```ts
  return { text, verdict, provenance: { model: MODEL_ID }, usage: { promptTokens, completionTokens, costUsd } };
  ```

  It is the same shape a `GradeRecord` carries. The SDK drops a number that is not finite and zero or
  more rather than let it into your totals.
- **`ai-help-refused` is a new interaction kind.** It fires where a learner is told help is not
  available, carrying `feature`, `reason` and — for a hint — `hintNumber`, and **never the text**: a
  hint refused for revealing the answer contains the answer. If you persist every interaction, expect
  this kind; if you `switch` over `InteractionKind` without a default, add it.

### Test your prompts *(0.19.0)*

```ts
import { formatAiCheckReport, runAiCheck } from '@intellectif/lk-core/ai-check';

const report = await runAiCheck({ explain, hint });   // your ports, your key, your CI
expect(report.refused).toBe(0);
```

It makes the calls a learner's questions would make, on items whose answers the SDK knows, and runs
the same checks it runs before a learner sees anything. See
[the AI guide](./ai.md#testing-your-prompt).

### `@intellectif/lk-ai` is gone *(0.19.0)*

It was never published and never held code. If a workspace build of yours references it, drop the
reference; nothing imports it.

---

## 18.0 → 18.1 (`lk-react`)

### A question you draw counts like one the SDK draws *(18.1.0)*

A `renderers` override used to get the shared props and nothing else. It now gets a `question` prop
as well — the pager's half of the contract, the same one `renderQuestion` gave a host inside
`<InteractiveVideo>` in 16.1.0.

```tsx
function MyReadAloud({ data, onSubmit, question }: ActivityProps & { question?: SequenceQuestion }) {
  useEffect(() => {
    if (question?.active === false) {
      stopMyMicrophone(); // the pager cannot reach a recorder it did not start
    }
  }, [question?.active]);

  const hand = async (take: Blob) => {
    question?.setPending(true); // onFinished waits for this
    try {
      onSubmit?.(await store(take));
    } finally {
      question?.setPending(false); // however it ends, a failure included
    }
  };
  // …
}
```

- **`active`** — whether this is the question on screen. **Stop the microphone, any timer and any
  speech when it turns `false`.**
- **`setPending`** — hold the set while your own work is in flight. Without it, a set could be
  reported a moment before its last answer was stored.
- **`portalContainer`** — a node inside this question's own pane. A popover portalled into
  `document.body` stayed on screen over the next question; this one is hidden with its own.
- **`clear()`** — the learner withdrew their answer, so the slot holds nothing again.
- **`emit(type, payload?)`** — an interaction with the `activityId` and the time filled in.
- **`slot`** — the identity to store against, the same object `onSubmit` reports.

**Nothing here is required.** A renderer that ignores `question` behaves exactly as it did.

### AI help in your own question *(18.1.0)*

`useAiHints` and `useAiExplanation` (`@intellectif/lk-react/ai/useAiHelp`, also on the root) give a
host's own renderer the rules, the facts and the refusals the bundled components use, with your own
markup — see [the AI guide](./ai.md#a-question-you-draw-yourself). `ask` does nothing where the rules
say no, so a page that draws its own button still reaches no model in an `exam`.

Pass on the `renderMode` your question was given. If you do not, the set the question sits in answers
for it, and an `exam` around it wins over anything you pass — so a renderer that defaults the mode to
`practice`, as components often do, still offers nothing on a paper of record.

### One possible type error *(18.1.0)*

`ActivityRenderer` is now `ComponentType<ActivityProps & { question?: SequenceQuestion }>`. Passing a
renderer typed `ComponentType<ActivityProps>` is still correct. The one assignment that stops
compiling is the other direction:

```ts
const mine: ComponentType<ActivityProps> = someActivityRenderer; // now an error
const mine: ActivityRenderer = someActivityRenderer;             // the fix
```

---

## 0.17 → 0.18 (`lk-core`) / 17.x → 18.x (`lk-react`)

### A returned grade must be a grade *(0.18.0)*

`evaluate` refuses a non-finite score and `gradeFromRubric` one outside `[0,1]`, but the return trip
took any number on trust: `outcomeFromGrade` mirrored any `GradeRecord`, and `composeAssessmentScore`
divided by whatever it was handed. A grader that returned raw points (85 "out of 1") composed with a
full-marks item to a **final** result, score 43, passed; `NaN` composed to a final `NaN` (`null` in
JSON); an infinite score to a final pass; and a score "out of 0" was read against 1. Both now check
the numbers the same way: `maxScore` a positive, finite number, and `score` a finite number from 0 to
it, with float noise of one part in a billion above `maxScore` accepted as it is.

- **`outcomeFromGrade`** returns `{ status: 'deferred', reason: 'grade_rejected', maxScore: 1,
  rejectedGrade }` for a record that fails, keeping the record verbatim. A valid record lifts exactly
  as before.
- **`composeAssessmentScore`** treats a `scored` or `graded` outcome with such numbers, and a
  `grade_rejected` outcome, as still owed a grade: out of the denominator, in `pendingSlotIds`, and
  in the new **`rejectedSlotIds`** on the result and its section. The result is `provisional` with
  `passed: null`. Not `unscorable`, which would drop the slot and let the attempt go final — a
  failing grade on the wrong scale would vanish into a pass.
- **`gradeFromRubric`** refuses a criterion weight below 0, and a weight sum that overflows to
  Infinity, as `unscorable`. It used to check only that the weights summed to a positive number, so
  `[0 ×2, 1 ×−1]` came back as a real 0 and `[1 ×2, 0 ×−1]` as a perfect 1.

See [Getting a deferred grade back](./authoring.md#getting-a-deferred-grade-back-v04) and
[Scoring a whole assessment](./authoring.md#scoring-a-whole-assessment-v04).

### What can change a recorded grade *(0.18.0)*

Only numbers that were never a grade. Every other input composes byte for byte as before: of the 564
vectors in the grade-stability corpus, one moves — `composeAssessmentScore/item-max-score-zero`,
which pinned the old reading of a score out of 0 against 1.

- **Look for stored outcomes it now reports.** A `graded` outcome an earlier release stored from such
  a record carries the bad numbers mirrored on it, and re-composing an attempt that holds one now
  returns `provisional` instead of the final result you recorded. Before you upgrade, search stored
  outcomes for a `score` or `maxScore` that is not a finite number (in JSON, `null`), a `maxScore` of 0
  or less, or a `score` below 0 or above its `maxScore` — then re-grade those slots.
- **A host that re-composes on read** sees `rejectedSlotIds` where it recorded a final grade. Route
  those slots to a re-grade; waiting will not fix them.

### What can stop a build *(0.18.0 / 18.0.0)*

- **`DeferredReason` gains `'grade_rejected'`.** A `switch` or a `Record<DeferredReason, …>` that
  lists every reason must handle it.
- `ItemOutcome`'s `deferred` arm gains an optional `rejectedGrade`, and `SectionScore` and
  `AssessmentScore` gain an optional `rejectedSlotIds`. Additive.

### What can change behaviour *(0.18.0 / 18.0.0)*

- **A refused grade renders as not graded yet.** Nothing in lk-react changed for it, but lk-react
  renders what `outcomeFromGrade` returns: a record it now refuses is a `deferred` outcome, shown as "Not graded
  yet." like any other. With lk-react 17, `<WrittenResponse>` showed the `graded` outcome it was
  handed with the record's own numbers — "Score 8500%. Passed." for 85 out of 1. A `graded` outcome
  stored by an earlier release is not re-read and still renders that way: re-grade it, as above.
- **No AI explanation for a grade that cannot be one.** `aiExplanationRequest` returns `null` for a
  `scored` outcome whose numbers fail the same check, so in `review` "Explain my answer" answers "No
  explanation is available right now." and your `explain` port is never called. In 17.0.0 such an
  outcome reached the model: 85 out of 1 on a wrong answer was sent as `correct`, passed.

## 0.16 → 0.17 (`lk-core`) / 16.x → 17.x (`lk-react`)

### Learners can ask an AI for help *(0.17.0 / 17.0.0)*

"Explain my answer" after grading and "Get a hint" before submit, in multiple choice,
fill-in-the-blanks, gap select and dictation (explanations only). Your model is reached through
ports you supply (`<LkAiProvider>` or an `ai` prop), and nothing appears without one. See
[AI help for learners](./ai.md).

### What can stop a build *(0.17.0 / 17.0.0)*

- **`LkStrings` gains eleven keys** (`aiExplain` … `aiNotice`). An object typed as a whole `LkStrings`
  must add them; an `LkStringsOverride` needs nothing.
- **Content with a field named `ai` of another shape now fails validation.** Every built-in type now
  defines `ai` as `{ hints?: boolean, explanations?: boolean }`. The loose schemas used to keep an
  unknown `ai` whatever it held, so a sidecar such as `ai: 'generated'` validated. It is now refused,
  and so is a non-boolean flag. Check stored content before upgrading, and rename a sidecar that used
  the name.
- `ActivityProps`, `ActivitySequenceProps`, `InteractiveVideoProps` and `InteractiveVideoQuestion` gain an optional `ai`, and
  `InteractionKind` gains `ai-hint-shown` and `ai-explanation-shown`. All additive.

### What can change behaviour *(0.17.0 / 17.0.0)*

- **`redact()` now keeps `ai.hints` and `ai.explanations`.** They are public, flag by flag, so a
  review honours an author who switched help off. Any other key inside `ai` is still removed.
- Nothing else changes for a host that passes no AI port.

## 0.15 → 0.16 (`lk-core`) / 15.x → 16.x (`lk-react`)

### A learner can read two caption languages *(16.0.0)*

`<InteractiveVideo>` can show a second caption language under the first — the language a learner
is learning, and their own. It is a learner's preference; nothing is authored. See
[Captions and the transcript](./interactive-video.md#captions-and-the-transcript).

- `VideoPreferences` gains `secondaryCaptionLanguage` (`null` for none).
- **`defaultPreferences`** is a new prop: a starting point below what the learner chose. Use it for a
  language pair you suggest. `preferences` keeps its meaning — it *forces* each field it names, every
  time a video opens — and is now documented as such.
- **`onPreferencesChange(next, change)`** reports every change the learner makes, for a host that
  keeps the choice on the learner's account and passes it back as `defaultPreferences`.
- `resolveCaptionTracks(tracks, preferences)` is exported: the rules the player uses to choose each
  line's track.
- The `video-captions-changed` interaction's payload gains `secondary`, and the event now fires when
  either line changes.
- Four optional tokens: `--lk-iv-caption-color`, `--lk-iv-caption-secondary-color`,
  `--lk-iv-caption-secondary-scale`, `--lk-iv-caption-gap`. Four new strings, listed in
  [docs/i18n.md](./i18n.md).

### What can stop a build *(0.16.0 / 16.0.0)*

- **A dictation whose recording carries `tracks` is now invalid**, and so is a group whose stimulus
  carries `tracks` while one of its dictations plays that stimulus. Both were already refused for
  `captionsUrl`; a track of either kind — a transcription or a translation of the words a dictation
  asks for — gives the answer away just as surely, and before this release redaction shipped such a
  track to an exam client. `validateActivity`, `validateItemGroup`, `assertRedacted`,
  `assertRedactedItemGroup` and `redact()` / `redactItemGroup()` now refuse it, with the same
  message, at `media.tracks`, `slowMedia.tracks` or `stimulus.media.tracks`; the drafts report
  `dc_captions_not_allowed` there. **Find any stored content like this before you upgrade**: remove the
  tracks, or give the dictation a recording of its own without them.
- A hand-built `LkStrings` needs the four new `video*` keys; an `LkStringsOverride` needs nothing.
- Nothing else: every new field and prop is optional.

### What can change behaviour *(16.0.0)*

- **The caption DOM.** The caption lines now sit inside a `<div class="lk-iv-captions">`, which is
  what is positioned over the video and lifted clear of the controls. Each line keeps its
  `.lk-iv-caption` class, its `span`, and `data-size` / `data-background`, and gains `data-role`
  (`primary` or `secondary`), `lang` and `dir="auto"` — so a rule that styles `.lk-iv-caption`'s text
  still applies. A rule that **positions** `.lk-iv-caption` (its margin, its alignment in the
  player) now positions a line inside the container: move it to `.lk-iv-captions`.
- **What the player remembers.** It now stores only the fields a learner changed, never a value a
  host forced, so a host suggestion reaches a learner who never chose that field. A payload stored by
  15.x reads as every field chosen — it behaves as it did.
- **A caption language is matched more loosely.** `captionLanguage: 'pt'` now finds a `pt-BR` track
  (and `es-MX` finds `es`) instead of falling back to the default track; where two tracks share a
  language, the `captions` one wins.
- `dir="auto"` on every caption line, transcript row and menu item that shows a track's text.

### A host can draw a video's questions *(16.1.0)*

`renderQuestion` hands each question to you to draw, and the video keeps counting it: answered,
required, the end card, `onFinished`. Return `undefined` to keep the SDK's component for a type. A
question you draw is told when it leaves the screen (`active`), has a place to portal popovers that
fullscreen paints (`portalContainer`), and can make Finish wait for work on its way
(`setPending`). See
[Rendering questions yourself](./interactive-video.md#rendering-questions-yourself). Nothing to do if
you do not use it — every addition is optional, and `recordingBinding` is now needed only for a
read-aloud the SDK draws.

### What can change behaviour *(16.1.0)*

- **Finish waits for a take still being stored.** A read-aloud whose take is uploading or being
  judged now holds Finish on the end card — `aria-disabled`, with "Saving your answer…"
  (`videoAnswerPending`, a new string) — and a video that ends with every answer in finishes once the
  take lands. Before, Finish reported that question `skipped`, and its answer reached `onSubmit` after
  the summary that called it skipped.
- **The end card's score follows a question's latest grade.** A grade that arrives while the card is
  on screen now shows at once, and a result with nothing to score (`maxScore: 0`) removes the
  question's score instead of leaving the earlier one.

## 0.14 → 0.15 (`lk-core`) / 14.x → 15.x (`lk-react`)

Nothing was removed and nothing changed shape. `lk-react` takes a major only because its peer range
moves to `@intellectif/lk-core@^0.15.0`.

### A video can ask questions *(0.15.0 / 15.0.0)*

An item group whose stimulus is a video may now carry a `timeline`: a list of quizzes, each at a
moment of the video, each holding one or more of the group's own questions. `<InteractiveVideo>`
plays it — pausing at each quiz, asking its questions over the video, then carrying on. See
[docs/interactive-video.md](./interactive-video.md).

```tsx
import { InteractiveVideo } from '@intellectif/lk-react/components/InteractiveVideo';

<InteractiveVideo group={video} onSubmit={save} onProgress={remember} />;
```

- **lk-core** gains `MediaTimeline`, `TimelineCue`, `TimelineChapter`, `MediaProgress`,
  `MediaTrack`, `INTERACTIVE_VIDEO_ITEM_TYPES`, `isInteractiveVideoItemType`, `readMediaProgress`,
  `composeTimelineScore`, `createInteractiveVideoDraft` and the `ig_timeline_*` authoring codes;
  `ActivityMedia` gains `tracks` and `poster`; `SequenceSlot.group` gains the `cue` a question sits
  in, and `AttemptPlanDrift` gains `changedCueSlotIds`.
- **lk-react** gains the `@intellectif/lk-react/components/InteractiveVideo` subpath, 48 new
  strings (all listed in [docs/i18n.md](./i18n.md)), the `.lk-iv-*` skin hooks, and one optional
  theme token, `--lk-color-media-accent`.

### What can stop a build *(0.15.0 / 15.0.0)*

- A **hand-written `ThemeTokens` object** is unaffected: `--lk-color-media-accent` is optional. A
  type that *implements* `ThemeTokens` exhaustively and is checked for excess properties needs no
  change either — the new key is optional, not required.
- A **`LkStrings` object you build by hand** (rather than with `mergeStrings`) must gain the 48
  `video*` keys. `LkStringsOverride` is a deep partial, so an override object needs nothing.
- Nothing else: every new field is optional, and every new export is an addition.

### What can change behaviour *(0.15.0 / 15.0.0)*

- **`redactItemGroup` now carries `timeline`, `poster` and `tracks` through** — they are
  learner-visible by definition. A snapshot test of a redacted group with a timeline will differ.
- **`flattenSequence` carries the timeline and each question's quiz** on `slot.group`. Code that
  compares whole slot objects will see the extra fields.
- **`planActivities` reports a moved quiz** as `changedCueSlotIds`, and the plan hash changes when
  a timeline changes — as it should: the questions are asked at different moments.
- A group with a timeline still pages as an ordinary testlet inside `<ActivitySequence>`; render
  `<InteractiveVideo>` for the interactive experience.

## 0.13 → 0.14 (`lk-core`) / 13.x → 14.x (`lk-react`)

Additive. Upgrade and change no code, and nothing you already render, validate
or score behaves differently — unless you hold items whose `type` is
`read-aloud`, registered a type of your own under that name, assert on the text
of `RedactedScoringError`, replay the grade vectors with a `replay.mjs` you
pinned, or hand a mounted `<ActivitySequence>` a new `activities` while a grade
is still on its way (all below). Every grade vector a released version froze
replays unchanged. 14.0.0 is a major because `lk-core` is a peer and moved a
minor; it also adds two components and a hook.

### A learner can read aloud *(0.14.0 / 14.0.0)*

`read-aloud` is a built-in type: the learner reads a text aloud, a
pronunciation-assessment engine of your choosing judges the recording, and the
SDK turns that judgement into a grade. It is graded asynchronously, as a written
response is — `evaluate()` answers `deferred` and `score()` throws
`DeferredScoringError` — and your server grades a take with `gradeReadAloud`
from the assessor's evidence and its own `inspectWav` measurement of the stored
recording. In the browser, `<ReadAloud>` records the take and hands it to your
storage through `recordingBinding`, and `<PronunciationFeedback>` renders the
marks. See [Speech assessment](./speech-assessment.md) for the data, the
evidence, the grade, and a worked binding.

What the type adds to shared surfaces, all optional:

- `GradeRecord.details` — one mark per reference word, for a review screen.
- A `code` on `ItemOutcome`'s `unscorable` arm, written by the new
  `outcomeFromUnscorable`, so a stored refusal says which one it was.
- A `rounding` option on `gradeFromRubric`, which compares the pass line the way
  a score is displayed and leaves the score itself unrounded.
- Seven `InteractionKind` literals for a take's recording, upload and
  assessment, which `<ReadAloud>` reports through `onInteraction`.
- `@intellectif/lk-core/scoring` now re-exports the types its own functions'
  signatures mention. Type-only.
- `<ActivitySequence>` takes `recordingBinding`, where every take in the set is
  stored, and `assessments`, keyed by `slotId` and read live, for the marks a
  `review` shows. A `renderers` override receives neither.

### What can stop a build *(0.14.0 / 14.0.0)*

- **A complete `LkStrings`.** `LkStrings` gained 40 strings, for read-aloud and
  for pronunciation feedback. A partial override is unaffected; a dictionary
  declared as a complete `LkStrings` does not type-check until it supplies them.
- **Code that lists every activity type or interaction.** A `switch` over
  `ActivityData`, `LearnerResponse`, `RedactedActivity`, `RenderableActivity` or
  `InteractionKind` whose `default` asserts `never`, and a table typed
  `Record<ActivityType, …>`, stop compiling until they have a `read-aloud` case
  or key — or, for `InteractionKind`, the seven new ones.

### What can change behaviour *(0.14.0 / 14.0.0)*

- **Items whose `type` is `read-aloud`**, which this SDK read as an unknown type
  until now, are read as the built-in. `validateActivity` validates them instead
  of throwing `UnknownActivityTypeError`, and `registeredActivityTypes()` lists
  one more type. `evaluate()` answers `deferred` where it answered `unscorable`,
  which changes a composed total that counted them as unscorable: the result
  now stays `provisional` until they are graded. `<ActivitySequence>` renders
  `<ReadAloud>` where it rendered its unsupported-item note — and `<ReadAloud>`
  throws without `recordingBinding.upload` outside `review`, so a `practice` or
  `exam` sequence carrying one needs a `recordingBinding`, or the slot renders
  the error boundary's fallback.
- **An outcome from a paper the sequence has since been handed is refused, for
  every activity type.** A grade still being computed when `activities` changed
  used to be recorded in whichever slot now stood at its index, and could report
  a set as finished whose question was never answered. `<ActivitySequence>` now
  records an outcome only when its `slotId` and `activityId` match the slot at
  that index, so a late one reaches no callback. A set that is merely
  re-created, with the same slots, still accepts it.
- **`RedactedScoringError`'s message is reworded**, for every type. The class,
  its `name` and its `activityType` are unchanged and no grade moves; an
  assertion on the exact text needs updating.
- **The grade-stability corpus is written in encoding version 2**, because a
  vector can now carry a recording's bytes. `replay()` throws on a corpus in
  another encoding, so load the `replay.mjs` shipped beside `vectors/scoring.json`
  rather than a copy you pinned.

A practice read-aloud inside a sequence also completes differently from every
other practice slot: it records `responded` when it is submitted, and its grade
replaces that when it arrives. `onFinished` waits for an assessment still in
flight, and a take that could not be stored completes its slot as
`unsubmitted` — not as `recording: null`, which is a blank the learner chose.
`onFinished` items may also carry `kind: 'unsubmitted'`, and a `scored` item
may carry the `response` the grade belongs to. `<ReadAloud>` no longer accepts
`captureGroup` as a prop. None of this changes a type that existed before; the
[changelog](https://github.com/intellectif/learning-kit/blob/main/packages/lk-react/CHANGELOG.md)
has the whole rule.

### If you registered a type named `read-aloud` *(0.14.0)*

The built-in now owns the name. `registerActivityType` throws at startup for a
different descriptor under `read-aloud`, and an `ActivityDataMap` augmentation
declaring `read-aloud` stops compiling. Rename your type, and migrate the `type`
stored on its items, or move the items to the built-in.

## 0.12 → 0.13 (`lk-core`) / 12.x → 13.x (`lk-react`)

Additive. Upgrade and change no code, and nothing you render, validate or score
behaves differently — unless you registered an activity type of your own named
`dictation`, hold items whose `type` is `dictation` without having registered
one, or build a type picker from `registeredActivityTypes()` (all three below):
every grade vector replays unchanged, and the new vectors pin the new type. 13.0.0 is a major because `lk-core` is a peer and
moved a minor; it also adds one component.

### A learner can be dictated to *(0.13.0 / 13.0.0)*

`dictation` is a built-in type: the learner hears a recording and types it, and
the grade is the character-level similarity of their text to the transcript —
`(length − edit distance) / length` over NFC code points, with case,
punctuation and spacing ignored and typographic apostrophes folded. See
[Dictation](./authoring.md#dictation--listen-and-type-v013--130) for the data
contract, the marking, the two recordings and the equivalence rules.

Three things the type adds to shared surfaces, all optional:

- `ScoringDetail.score?: number` — a per-item score in [0, 1]. Written by the
  dictation scorer (each transcript word's similarity), by nothing else, and
  ignored by every reader that does not know it.
- `score(type, data, response, options?)` and `evaluate(data, response,
  options?)` take an optional `{ rounding: RoundingPolicy }`, which compares
  the pass line — and selects the authored feedback — the way a score is
  displayed. Without it, both behave exactly as before. A malformed policy
  throws a `RangeError`, and `null` reads as none.
- `ActivityDataMap`, `LearnerResponseMap` and `RedactedActivity` gain a member
  (and so do `ActivityType` and lk-react's `RenderableActivity`) — see below
  for the code that notices.

`dictationType` is exported from the barrel, and so — at last — is
`gapSelectType`, which 0.10.0 registered without exporting. So are
`MediaPlaybackPolicy`, the type of `ActivityMedia.playback`, which until now
could only be reached as `NonNullable<ActivityMedia['playback']>`, and
`NativeControlHint`, the element type of its `nativeControlHints`.

`registeredActivityTypes()` now lists `dictation`, so a type picker built from
it shows one more entry. Items whose `type` is `dictation`, which this SDK read
as an unknown type until now, are read as the built-in: `validateActivity`
validates them instead of throwing `UnknownActivityTypeError`, `evaluate()`
scores them instead of returning `unscorable` — which changes a composed total
that counted them as unscorable — and `<ActivitySequence>` renders
`<Dictation>` where it rendered its unsupported-item note.

### What can stop a build *(0.13.0 / 13.0.0)*

- **A complete `LkStrings`.** `LkStrings` gained the dictation strings. A
  translation passed as a partial override — an `LkStringsOverride`, or an
  object literal handed straight to `strings` — is unaffected. A dictionary
  declared as a complete `LkStrings` does not type-check until it supplies the
  new keys.
- **Code that lists every activity type.** A `switch` over `ActivityData`,
  `LearnerResponse`, `RedactedActivity` or `RenderableActivity` whose
  `default` asserts `never`, and a table typed `Record<ActivityType, …>`, stop
  compiling until they have a `dictation` case or key. A `default` that does
  not assert `never` already covers the new type.
- **Narrowing by a property one type used to own.** `DictationLearnerResponse`
  has `text`, as `WrittenResponseLearnerResponse` does, so `'text' in response`
  no longer picks out a written response: code that then reads `wordCount` stops
  compiling. Narrow on `response.type` instead.

### If you registered a type named `dictation` *(0.13.0)*

The built-in now owns the name. `registerActivityType` throws at startup for a
different descriptor under `dictation`, and an `ActivityDataMap` augmentation
declaring `dictation` stops compiling. Rename your type, and migrate the
`type` stored on its items, or move the items to the built-in.

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
  RedactedActivity,               // discriminated union of every built-in type
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
