# Authoring & content storage

This guide explains how to **create activity content**, **validate** it, **render** it, **track** it with xAPI, and where the SDK's responsibility ends and yours begins. Read this fully before integrating — it documents both the possibilities and the V1 limitations.

## Shared-responsibility model

Learning Kit is a **runtime + data contract**, not a content-management system.

| The SDK owns | Your application owns |
|---|---|
| Typed activity **schemas** + `validateActivity` + JSON Schema export | The **authoring UI / "hub"** (or hand-authored JSON) |
| **Scoring** (pure, deterministic) | **Persistence** (DB, S3) of content, answers, results |
| **xAPI** statement construction + delivery (`useXAPI`) | **Delivery / CDN** (e.g. CloudFront), the LRS itself |
| Accessible **components**, theming, optional skin | **Auth**, multi-tenant, learner identity, retry policy |
| Composition (`ActivitySequence`) | Listing, versioning, publishing workflow |

"Creating an activity" = producing a JSON object that conforms to an activity schema. There is **no GUI** in the SDK (by design — see the requirements "Non-Goals and Shared Responsibility"). You can hand-author JSON, generate a form from the exported JSON Schema, or (Phase 3) generate it with AI.

## The data flow

```
author/store JSON  ──►  fetch (your API / S3 / CDN)  ──►  validateActivity()
      ──►  <Activity data={…} onComplete={…} onInteraction={…} />
      ──►  onInteraction / onComplete (ActivityResult)  ──►  persist + useXAPI → LRS
```

```ts
import { validateActivity } from '@intellectif/lk-core';

const raw = await fetch(`/api/activities/${id}`).then((r) => r.json());
const result = validateActivity(raw.type, raw); // 'multiple-choice' | 'fill-in-the-blanks'
if (!result.success) {
  // result.errors: { path, message, code }[]  — reject at your boundary
  throw new Error(`Invalid activity: ${JSON.stringify(result.errors)}`);
}
render(<MultipleChoice data={result.data} onComplete={persistAndSend} />);
```

`validateActivity` is the **authoritative** validator. The exported JSON Schemas (`multipleChoiceJsonSchema`, `fillInTheBlanksJsonSchema`, Draft-7) are a **structural** aid for form generators / AI prompts only — semantic rules (≥1 correct option, single-select exactly-one-correct, passage↔blank bijection, image/embed needs `alt`) are Zod `.refine()`s and are **not** in the JSON Schema. JSON-Schema-valid is *not* guaranteed Zod-valid; always run `validateActivity`.

## Activity data model

Shared optional fields on **every** activity: `passThreshold` (0–1, default 0.7), `locale`, `learningObjectives`, `difficultyLevel` (1–5), `media`, `feedback`.

### Multiple Choice

```jsonc
{
  "schemaVersion": "1.0",
  "type": "multiple-choice",
  "id": "capital-jp",
  "title": "World Capitals",
  "question": "Which city is the capital of Japan?",
  "mode": "single",                 // "single" | "multi"
  "scoringStrategy": "all-or-nothing", // | "partial"
  "shuffle": true,                   // optional, deterministic per session
  "options": [
    { "id": "tokyo", "text": "Tokyo", "isCorrect": true,  "feedback": "Correct!" },
    { "id": "seoul", "text": "Seoul", "isCorrect": false, "feedback": "That's South Korea." }
  ],
  "feedback": { "correct": "Great!", "incorrect": "Review and retry." }
}
```

Rules: 2–10 options; ≥1 correct; `mode: "single"` ⇒ **exactly one** correct. `partial` scoring: `max(0, correctSelected/totalCorrect − incorrectSelected/totalIncorrect)`.

### Fill-in-the-Blanks

```jsonc
{
  "schemaVersion": "1.0",
  "type": "fill-in-the-blanks",
  "id": "water-cycle",
  "title": "The Water Cycle",
  "passage": "Water becomes vapour through {{evaporation}} and returns as {{precipitation}}.",
  "blanks": [
    { "id": "evaporation",  "acceptedAnswers": ["evaporation"], "hint": "Starts with E" },
    { "id": "precipitation","acceptedAnswers": ["precipitation", "rain"],
      "caseSensitive": false, "trimWhitespace": true }
  ],
  "scoringStrategy": "partial"
}
```

Rules: every `{{id}}` placeholder must appear **exactly once** and have exactly one matching blank, and vice-versa; blank ids and option ids must be unique. Defaults: `caseSensitive: false`, `trimWhitespace: true`. `partial` = correctBlanks / totalBlanks. Hints have a Show/Hide toggle.

**Matching tolerances (v0.3, opt-in).** A blank may carry a `match` policy; absent, matching is the exact v1 behaviour (trim + case-insensitive equality). Every field is opt-in because a new tolerance changes what "correct" means:

```jsonc
{ "id": "esta", "acceptedAnswers": ["está"],
  "match": { "normalize": "NFC", "foldDiacritics": true, "levenshtein": 1 } }
```

`normalize: "NFC"` fixes composed-vs-decomposed accent input; `foldDiacritics` accepts `esta` for `está`; `levenshtein` allows small typos; also available: `collapseInnerWhitespace`, `ignorePunctuation`, `locale` (locale-aware case folding), `caseSensitive`, `trim`. The standalone `matchText()` export returns *how* a match happened (`exact` / `normalized` / `folded` / `fuzzy`) for graded-tolerance policies.

### Written Response (v0.3)

Free-text writing graded **asynchronously** — by your AI grader or a human. The SDK owns the contract, the word-count canon, and the deferred-outcome semantics; the grader is yours.

```jsonc
{
  "schemaVersion": "1.0",
  "type": "written-response",
  "id": "daily-routine",
  "title": "My Daily Routine",
  "prompt": "Describe your daily routine in 80–120 words.",
  "minWords": 80,
  "maxWords": 120,
  "languageTarget": "en-A2",
  "rubric": {
    "criteria": [
      { "name": "Task achievement", "weight": 2 },
      { "name": "Grammar range and accuracy", "weight": 1.5 },
      { "name": "Vocabulary", "weight": 1.5 }
    ]
  }
}
```

- **Scoring is deferred.** `score('written-response', …)` throws `DeferredScoringError`; use `evaluate(data, response)`, which returns `{ status: 'deferred', reason: 'requires_async_grading', partial: { withinWordBounds, wordCount } }`. `wordCount` is recomputed server-side-safe with the exported `countWords()` (split on `\s+`; hyphenated tokens count as one) — never trust a client-supplied count.
- **The component** (`@intellectif/lk-react/components/WrittenResponse`) renders prompt + textarea + live word counter and completes via `onSubmitted({ text, wordCount, withinWordBounds, timeSpent, xapiStatement })` — no fake score is ever emitted for ungraded work. The xAPI statement uses the **`submitted`** verb (`http://activitystrea.ms/schema/1.0/submit`) with no `score`/`success`/`completion`.
- **The rubric reaches the learner.** `redact()` classifies it `public`: a rubric tells the learner what they are being graded on, which is the point of publishing one. A deployment that wants it hidden can tighten it per call with `redact(data, { policy: { rubric: 'author-only' } })`.
- **Unknown keys survive.** All v0.3 schemas are loose — sidecars like `promptHtml` or your own fields pass through `validateActivity` verbatim (no more merge workarounds).

### Getting a deferred grade back (v0.4)

`evaluate()` returns `{ status: 'deferred' }` for a written response, because the
grade does not exist yet. When your grader finishes, hand the result back as a
`GradeRecord` and lift it into an outcome:

```ts
import { gradeFromRubric, outcomeFromGrade, hasGrade } from '@intellectif/lk-core';

// Your grader returns judgements per criterion; the SDK does the arithmetic.
const grade = gradeFromRubric(
  [
    { name: 'Task achievement', score: 0.8, weight: 2, comment: 'Covers all prompts.' },
    { name: 'Grammar',          score: 0.6, weight: 1.5, comment: 'Tense slips in paragraph 2.' },
    { name: 'Vocabulary',       score: 0.7, weight: 1.5 },
  ],
  activity,                       // supplies passThreshold
  { feedback: 'Solid answer — watch past tense.' },
);

if ('unscorable' in grade) {
  // No criterion carried a numeric score. Never a zero.
} else {
  const outcome = outcomeFromGrade({ ...grade, requiresHumanReview: false });
  // Render it read-only, with the grade visible:
  // <WrittenResponse data={a} renderMode="review" value={submitted} outcome={outcome} />
}
```

**Why the SDK computes the total.** A grader is asked for judgement, not mental
arithmetic. If the model also returns the weighted total, the grade becomes
unverifiable and irreproducible — two runs can disagree for identical criterion
scores. `gradeFromRubric` makes the total a pure function of the judgements, so
a grade can be recomputed and audited years later. Weights are normalised by
their sum (they need not add to 1), and criteria that are `notApplicable` or
carry only a `band` are excluded from both numerator and denominator.

`GradeRecord` also carries `corrections` (anchored in the learner's text),
`evidence`, `rationale`, `confidence`, `requiresHumanReview`, `grader`
provenance and token/cost `usage` — the SDK stores and renders them; what they
mean is yours. Use `hasGrade(outcome)` rather than `status === 'scored'`, or you
will silently miss asynchronously graded work.

### Media per question


Optional `media` on either activity, rendered above the question/passage:

```jsonc
{ "media": { "type": "image", "url": "https://cdn.example/x.png", "alt": "A diagram" } }
{ "media": { "type": "audio", "url": "https://cdn.example/clip.mp3", "captionsUrl": "https://cdn.example/clip.vtt" } }
{ "media": { "type": "video", "url": "https://cdn.example/v.mp4" } }
{ "media": { "type": "embed", "url": "https://www.youtube.com/embed/VIDEO_ID", "alt": "Lesson video" } }
```

- `image` and `embed` **require** non-empty `alt` (WCAG). `embed` renders a sandboxed responsive iframe — pass the provider's **embeddable** URL (`/embed/<id>`), **not** the watch page (a YouTube watch link cannot play in `<video>`).
- `video`/`audio` use native controls; provide `captionsUrl` (WebVTT) for captions.
- **URL-only**: the SDK never hosts media. Hosting/CDN is yours.

### Feedback

Two composable layers, both authored by you (the scoring engine never synthesizes feedback — `ScoringResult.feedback` is `null` in V1):

1. **Per-item, on the spot** — Multiple Choice `option.feedback`, and Fill-in-the-Blanks per-blank `blank.feedback`. Rendered **inline next to that item, immediately after submission**, colour-keyed by correctness. This is deliberate: immediate, item-localized feedback is the strongest formative-learning signal (vs. an end-of-activity summary).
2. **Activity-level overall** — `feedback: { correct?, incorrect? }`. After submit, the `correct` message shows if the learner passed (score ≥ pass threshold), else `incorrect`, in the activity's `aria-live` region (h5p "Overall Feedback" parity).

```jsonc
// Fill-in-the-Blanks blank with hint + per-blank feedback
{ "id": "evaporation", "acceptedAnswers": ["evaporation"],
  "hint": "Starts with E", "feedback": "Liquid → gas when heated." }
```

**Display & control:** per-item feedback **defaults visible**; the component shows an accessible **"Hide feedback / Show feedback" toggle** (kept operable after submission) so the learner can declutter and restore it without losing results. An aggregate end-of-set summary is a consumer / Phase-2 `ActivitySequence` concern. **Phase 2 (not V1):** score-band ("0–49% / 50–100%") feedback.

The Fill-in-the-Blanks **hint** control renders a default **icon** (the SDK owns the affordance) with a text accessible name (`aria-label` "Show hint"/"Hide hint", `aria-expanded`); restyle/replace the glyph via the `.lk-fib-hint-btn` class — see [styling](./styling.md).

## Question sets — `ActivitySequence`

To present several questions with in-place navigation (no scrolling):

```tsx
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';

<ActivitySequence
  activities={[q1, q2, readingGroup, q3]}       // SequenceEntry[]: activities and item groups
  onSubmit={(response, slot) => save(slot.slotId, response)}   // every mode, before grading
  onActivityComplete={(result, index, slotId) => persist(slotId, result)}  // practice only
  onFinished={(items) => finalize(items)}       // every slot done; each item carries its slotId
/>;
```

**`onSubmit` is the only response channel an exam has.** In `exam` mode the components never grade, so `onActivityComplete` cannot fire and `onComplete` never will. `onSubmit` fires in every mode, before any grading, with the raw response and the slot that produced it — persist `response` against `slot.slotId`. `onFinished` still reports the finished set: an exam slot contributes a `responded` outcome carrying the raw answer, since a grade is not the client's to produce.

**Persist against `slotId`, never `index`.** `index` is where a question was *presented*; it moves under shuffling, and it already differs from the slot identity as soon as a group is involved (the second entry is presented at index 1 but is slot `"1.0"` when it is a group's first question). `composeAssessmentScore` scores by `slotId`, so a row keyed on the presented index cannot be reconciled with the grade.

It renders one question at a time with **Previous / Next**, a "Question X of N" `aria-live` indicator, and moves focus to the new question (keyboard/SR friendly). Navigation is **linear and free** (back/forward, learner-controlled). Every slot stays mounted, so going back never loses an answer.

**Shuffling** is opt-in and seeded. `shuffle="entries"` reorders the top-level entries — an item group moves as **one block** — and a group reorders its own questions only when it declares `shuffle: 'within-group'`. Pass `shuffleSeed` (the attempt id) so the server's `flattenSequence(entries, { seed })` derives the same order the learner sees.

`shuffleSeed` is **required in `exam` and `review` mode**: shuffling without one throws at render, because an order nobody can reproduce cannot be reconciled with the attempt the server recorded, and render time is the last moment that mistake is cheap. In `practice` it stays optional — the pager falls back to a random per-mount seed, stable within the mount and deliberately not reproducible. That fallback is the *only* place anything in the SDK invents a seed, and it is not SSR-safe (server and client would invent different orders and hydration would mismatch), so pass a seed for any server-rendered sequence whatever the mode.

**Not in V1:** auto-advance, submit-gating, aggregate-score UI (compute it with `composeAssessmentScore` from the `onFinished` items).

## Shared stimulus & item groups (v0.4)

Reading and listening comprehension is one passage or recording serving several questions. The SDK models that as **content**, not as a layout trick: an `ItemGroup` carries a `Stimulus` and the items that refer to it, and it drops into a sequence, a lesson quiz or an exam section like any activity.

```ts
import { type ItemGroup, validateItemGroup } from '@intellectif/lk-core';

const reading: ItemGroup = {
  schemaVersion: '1.0',
  type: 'item-group',
  id: 'reading-1',
  title: 'Reading — Part 1',
  stimulus: {
    id: 'passage-tides',
    kind: 'text',                            // 'text' | 'audio' | 'video' | 'image' | 'mixed'
    title: 'Tides',
    body: 'Along most coasts the tide comes in twice a day…',
    bodyHtml: '<p>Along most coasts…</p>',   // optional sidecar; `body` is the fallback
    attribution: 'Adapted from a public-domain primer',
  },
  items: [q1, q2, q3],                       // ActivityData[] — ids unique within the group
  shuffle: 'none',                           // or 'within-group'
};

validateItemGroup(reading); // container + stimulus + every item against its registered schema
```

`kind` is enforced: a `text` or `mixed` stimulus needs a non-empty `body`; `audio`, `video`, `image` and `mixed` need `media` of a fitting type (a `video` accepts an `embed`). `bodyHtml` requires `body`, because the plain text is what renders when no sanitiser is supplied. `transcript` is the one **author-only** field — for item generation and grading — and is removed before the learner sees the group. `validateItemGroup` reports an unregistered item type as an error at `items.<index>.type` rather than throwing, so an author fixing a six-item group sees every problem at once.

**Two rules, both from observed failures.** A group is **shuffle-atomic**: shuffling a section moves the group as a block and never interleaves two passages' questions. And the stimulus is **persistent**: `ActivitySequence` mounts it once and keeps it beside every question in the group — the passage is the same DOM node throughout, and a recording keeps playing across its questions. It is never hidden behind a toggle the learner has to reopen per question.

**Ordering is lk-core's job, on both ends.**

```ts
import { flattenSequence } from '@intellectif/lk-core';

const slots = flattenSequence(entries, { shuffleEntries: true, seed: attemptId });
// slots[i] = { slotId, index, activity, group?: { id, title?, stimulus, position, size } }
```

**Shuffle fairness — `version`.** `seededShuffle(items, seed, { version })` selects the draw. Version 1 (the default) takes the Fisher–Yates index from the low bits of its generator, and those bits are strongly correlated: on a four-option item only 12 of the 24 orders are reachable *for any seed*, and the last authored option lands first 8% of the time against 42% second. Version 2 draws from the high bits and reaches every order uniformly. Version 1 stays the default because these permutations are a wire contract — an attempt may be stored with only its seed, and a review render has to reproduce what the learner saw — so switching it is a package major. Pass `{ version: 2 }` for new content where no attempt has been recorded yet.

`slotId` is derived from the **authored** position (`"2"` for the third entry, `"2.1"` for the second item of a group in that entry), so it is unique and stable under shuffling — the same activity in two entries is two slots. Record `slots` on the server when the attempt starts, and feed `slotId` to `composeAssessmentScore`. The pager reports the same `slotId` on every `SequenceItemOutcome` and on `onActivityComplete`. `flattenSequence` **requires** a seed whenever anything shuffles and never invents one; the only fallback anywhere is the pager's practice-mode seed described above. It also **refuses an empty group**: contributing no slots would delete a whole section — stimulus and questions — from a sequence that still looked well-formed, and `composeAssessmentScore` would then report a `final` grade over whatever survived.

> **`slotId` is positional, so version your entries.** It is stable under shuffling, but it is an index into *one particular* entries array: inserting a question at the top of a published exam shifts every id below it, and stored rows keyed `"3"` silently start denoting a different question. Persist a version or content hash of the entries array alongside the slot ids, and treat any insert, delete or re-order of a published paper as a new version rather than an edit.

**Redaction.** `redactItemGroup(group)` redacts every item through `redact()` and the stimulus through its own fail-closed policy (the transcript goes; the passage, media and attribution stay). `assertRedactedItemGroup` proves the result learner-safe — each item against its own type's redacted schema, failures reported at `items.<index>` — before it leaves the server. Per-call `policy` overrides reach every item, so `redactItemGroup(group, { policy: { rubric: 'author-only' } })` tightens an essay inside a group exactly as it would alone.

**Rendering a redacted group.** A server hands over `redactItemGroup()` output, whose items are `RedactedActivityData` — an index-signature type that proves a payload is learner-safe but says nothing about its shape, so TypeScript cannot see the fields a renderer needs. Cross that gap once, with `asRenderableSequence`, and set the mode:

```tsx
import { asRenderableSequence } from '@intellectif/lk-react';

<ActivitySequence
  activities={asRenderableSequence(await fetchExam())}
  renderMode="exam"                 // required: redacted data has no answer key
  shuffleSeed={attemptId}
  onSubmit={persist}
/>;
```

`renderMode` is not optional here in practice: the default `practice` mode grades locally, and every built-in component throws at **render** when handed redacted data in it, rather than failing inside the submit handler after the learner has answered — where React error boundaries cannot reach.

**Media in a group stops when the learner leaves it.** The pager keeps every question and every stimulus mounted, so answers survive back-navigation; hidden panes are `display: none`, which does **not** stop playback on its own. So the pager pauses any `<audio>`/`<video>` in a pane as that pane hides, preserving `currentTime` — a recording keeps its position between questions of its own group, stops when the learner navigates out of the group, and never auto-resumes. A provider `embed` cannot be controlled this way (that needs the provider's own JS API, and the author supplies the URL), so use `audio`/`video` media for anything that must stop.

**Rendering a stimulus on its own.** `<StimulusPanel stimulus={…} range={{ first: 3, last: 8 }} sanitizeHtml={…} />` is the panel the sequence uses — a landmark region named by the stimulus title (or its kind), showing media, body and attribution. In a sequence it is rendered as a **sibling** of the question region, not inside it, so navigation puts focus on the question while the passage stays a landmark the learner can jump back to. Reach for it in a custom runner that lays out passage and question side by side.

**JSON Schema.** `stimulusJsonSchema` and `itemGroupJsonSchema` describe the container; items appear only as `{ type, id }` there. Each item's contract stays `jsonSchemaFor(type)`, so a generation pipeline asks for the group and its items separately instead of from a copied nested schema.

## Scoring a whole assessment (v0.4)

`composeAssessmentScore` turns per-item outcomes into a weighted, sectioned
grade, so the client that shows a breakdown and the server that records it run
the same formula:

```ts
import { composeAssessmentScore, type RoundingPolicy } from '@intellectif/lk-core';

const rounding: RoundingPolicy = { mode: 'half-up', dp: 2 }; // no default — you choose

const result = composeAssessmentScore(
  [
    { id: 'reading', weight: 2, items: [
      { slotId: 's1', points: 1, outcome: readingOutcome1 },
      { slotId: 's2', points: 3, outcome: readingOutcome2 },
    ]},
    { id: 'writing', weight: 1, passThresholdOverride: 0.5, items: [
      { slotId: 's3', points: 1, outcome: essayOutcome },
    ]},
  ],
  { passThreshold: 0.7, sectionThreshold: 0.6, rounding },
);

result.status;            // 'final' | 'provisional'
result.score;             // weighted total, scaled [0,1], rounded once
result.passFailureReason; // 'overall_below_threshold' | 'section_below_threshold' | 'both' | null
result.pendingSlotIds;    // items still awaiting a grade
```

**Ungraded work is never a zero.** `deferred` and `unscorable` items are left
out of the denominator and listed in `pendingSlotIds`, and the whole result is
`provisional` until every item has a grade. A section with nothing graded is
excluded from the weighted total entirely (remaining weights are renormalised)
rather than contributing zero — otherwise a midterm with an unmarked essay
reads as a failing 50%, and a learner sees a fail for work nobody has marked.
**Do not record a `provisional` score as final.**

**Use `slotId`, not the activity id.** The same activity can appear in two
sections; keying on the activity collapses them and scores the second one zero.

### Rounding is two operations

- `roundGrade(value, policy)` — the number a learner is shown and recorded
  against. `dp` is required and load-bearing: at 2 places, "70%" on screen is
  not a fail at 69.6 in the gradebook.
- `classifyBand(value, bands)` — level placement, which deliberately **floors**.
  Over-placement is the more harmful error, so a boundary is never reached by
  rounding up.

A single shared default would silently invert one of them, so the SDK ships no
default for either. `gte(value, threshold, policy)` rounds **both** sides before
comparing, so the displayed number and the pass decision cannot disagree.

## Custom activity types end to end


`registerActivityType` (lk-core) makes a custom type validate, score, redact and
export JSON Schema. To put it on screen, register a renderer with the sequence:

```tsx
import { defineActivityType, registerActivityType } from '@intellectif/lk-core';
import { ActivitySequence } from '@intellectif/lk-react';

registerActivityType(defineActivityType<MatchingData, MatchingResponse>({
  type: 'matching',
  schema: MatchingSchema,
  scoring: { kind: 'sync', score: scoreMatching },
  fieldPolicy: { /* … */ },
}));

<ActivitySequence activities={items} renderers={{ matching: MatchingItem }} />
```

A renderer receives the standard `ActivityProps`. Keys match `data.type`, and a
key matching a built-in overrides it — so you can replace the bundled renderer
for a type without forking the sequencer.

**Mixed sets and completion.** `onComplete` promises `ActivityResult[]`, so it
fires only when every slot was scored at submit time. A set containing a
written response (graded later) can never satisfy that; use `onFinished`, which
reports a `SequenceItemOutcome` per slot — `kind: 'scored'` with a result, or
`kind: 'submitted'` with the ungraded submission.

## xAPI tracking


Components emit a structurally-valid statement with an **anonymous actor** and a `urn:learning-kit:activity:<id>` object — they cannot know the learner. Apply real identity at the LRS layer via `useXAPI`:

```tsx
const { sendStatement } = useXAPI({
  endpoint: 'https://lrs.example/xapi/statements',
  auth: { type: 'bearer', token } /* or { type:'basic', username, password } */,
  activityId: 'https://your-app/quiz/water-cycle',
  actor: { objectType: 'Agent', mbox: 'mailto:learner@example.com' },
  onError: (err) => log(err), // after retries exhausted
});
// in onComplete:
void sendStatement(result.xapiStatement); // never throws; retries 5xx/network (1s/2s/4s), 4xx fails fast
```

`onComplete` delivers an `ActivityResult`: `{ score (0–1), maxScore (1), passed, timeSpent (ms), xapiStatement }`.

## Retry

Retry is supported and **consumer-triggered** via the reset-on-`data`-change rule (Req 3.7):

```tsx
// Option A: change the React key to remount fresh
<MultipleChoice key={attempt} data={quiz} onComplete={…} />
// then: setAttempt((n) => n + 1)

// Option B: pass a new data object reference (e.g. a fresh fetch / shuffled copy)
```

The SDK ships **no** retry button — *retry policy* (how many attempts, when, whether to reshuffle, whether to clear answers) is yours. `ActivitySequence` has no per-item retry UI in V1.

## Answer persistence & resume

- Components are **uncontrolled by default**: with no `value` or `defaultValue`, in-progress answers live only in component state and are **cleared** when `data` changes (the retry mechanism above).
- **You persist** by capturing `onInteraction` (every selection / blank-fill / hint / submit), `onChange` (every response change), and the `onComplete` `ActivityResult`, and writing them to your store (DB, `localStorage`, …). The SDK never reads or writes any store — it is store-agnostic and SSR/RSC-safe.
- **Resume is supported** (since lk-react 2.1.0). Every activity component follows the React controlled/uncontrolled convention:
  - `defaultValue` seeds an uncontrolled component at mount — the one-line way to re-hydrate a partially-answered activity. It is read at mount only; to re-seed later, remount with a new `key`.
  - `value` + `onChange` make the component fully controlled: the rendered answer is *always* yours, so you can autosave a delta, restore an interrupted attempt, or drive a review render.

  ```tsx
  <MultipleChoice
    data={q}
    defaultValue={savedResponse}                 // resume where the learner left off
    onChange={(response) => autosave(q.id, response)}
    onComplete={finish}
  />
  ```

  In a sequence, seed each slot from your store keyed by its `slotId` (see the item-group section). What the pager itself does **not** persist is the learner's position and which slots are already submitted — that state is per-mount, so a resumed attempt reopens at question 1 with every slot re-answerable. Persist the position yourself and render the set you still want answered.

## SSR / React Server Components

All activity components carry `'use client'` and render correctly inside an RSC tree (e.g. Next.js App Router), hydrating on the client. A server-rendered static shell with a separately hydrated island is Phase 2.

## Versioning

Every activity carries `schemaVersion: "1.0"`. V1 ships a single version; a migration framework is introduced only when the first breaking schema change lands.
