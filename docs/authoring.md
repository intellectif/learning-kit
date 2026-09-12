# Authoring & content storage

This guide explains how to **create activity content**, **validate** it, **render** it, **track** it with xAPI, and where the SDK's responsibility ends and yours begins. Read this fully before integrating — it documents both the possibilities and the V1 limitations.

## Shared-responsibility model

Learning Kit is a **runtime + data contract**, not a content-management system.

| The SDK owns | Your application owns |
|---|---|
| Typed activity **schemas** + `validateActivity` + JSON Schema export | The **authoring UI / "hub"** (or hand-authored JSON) |
| Draft contracts for an editor: `validateDraft`, `createDraft`, `<ActivityPreview>` | The editor's forms, their layout, and what a new question starts with beyond the SDK's empty draft |
| **Scoring** (pure, deterministic) | **Persistence** (DB, S3) of content, answers, results |
| **xAPI** statement construction + delivery (`useXAPI`) | **Delivery / CDN** (e.g. CloudFront), the LRS itself |
| Accessible **components**, theming, optional skin | **Auth**, multi-tenant, learner identity, retry policy |
| Composition (`ActivitySequence`) | Listing, versioning, publishing workflow |

"Creating an activity" = producing a JSON object that conforms to an activity schema. There is **no GUI** in the SDK (by design — see the requirements "Non-Goals and Shared Responsibility"). You can hand-author JSON, generate a form from the exported JSON Schema, or (Phase 3) generate it with AI. If you build an editor, the SDK supplies what only it can know about each type — which problems in an unfinished question are still to be written and which are wrong, an empty draft to start from, and a preview that copes with a half-written question: see [Building an editor](#building-an-editor-v09).

## The data flow

```
author/store JSON  ──►  fetch (your API / S3 / CDN)  ──►  validateActivity()
      ──►  <Activity data={…} onComplete={…} onInteraction={…} />
      ──►  onInteraction / onComplete (ActivityResult)  ──►  persist + useXAPI → LRS
```

```ts
import { validateActivity } from '@intellectif/lk-core';

const raw = await fetch(`/api/activities/${id}`).then((r) => r.json());
// raw.type: 'multiple-choice' | 'fill-in-the-blanks' | 'written-response',
// or any type you registered with registerActivityType().
const result = validateActivity(raw.type, raw);
if (!result.success) {
  // result.errors: { path, message, code }[]  — reject at your boundary
  throw new Error(`Invalid activity: ${JSON.stringify(result.errors)}`);
}
render(<MultipleChoice data={result.data} onComplete={persistAndSend} />);
```

`validateActivity` is the **authoritative** validator. The exported JSON Schemas (`multipleChoiceJsonSchema`, `fillInTheBlanksJsonSchema`, `writtenResponseJsonSchema`, `stimulusJsonSchema`, `itemGroupJsonSchema` — all Draft-7 — plus `jsonSchemaFor(type)` for any registered type) are a **structural** aid for form generators / AI prompts only — semantic rules (≥1 correct option, single-select exactly-one-correct, passage↔blank bijection, image/embed needs `alt`) are Zod `.refine()`s and are **not** in the JSON Schema. JSON-Schema-valid is *not* guaranteed Zod-valid; always run `validateActivity`.

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
  "shuffle": true,                   // optional; seeded by `shuffleSeed`, else per mount
  "options": [
    { "id": "tokyo", "text": "Tokyo", "isCorrect": true,  "feedback": "Correct!" },
    { "id": "seoul", "text": "Seoul", "isCorrect": false, "feedback": "That's South Korea." }
  ],
  "feedback": { "correct": "Great!", "incorrect": "Review and retry." }
}
```

Rules: 2–26 options; ≥1 correct; `mode: "single"` ⇒ **exactly one** correct. `partial` scoring: `max(0, correctSelected/totalCorrect − incorrectSelected/totalIncorrect)`.

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
provenance and token/cost `usage`. The SDK **stores** all of them; in `review`
mode `<WrittenResponse>` renders four: the per-criterion `criteria` scores, the
inline `corrections`, the grade `feedback`, and — when `requiresHumanReview` is
true — a **learner-visible** notice that the grade is awaiting a teacher. If your
deployment treats "awaiting review" as internal, that last one is not internal.
`evidence`, `rationale`, `confidence`, `grader` and `usage` are never rendered;
they are carried for your own UI, audit trail and review queue. Use `hasGrade(outcome)` rather than `status === 'scored'`, or you
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

### Playback policy (v0.8)

A listening paper usually needs the recording played on the paper's terms, not
the browser's. `media.playback` says so, on **audio only**:

```jsonc
{ "media": { "type": "audio", "url": "/audio/part2.mp3", "alt": "Part 2",
             "playback": { "maxPlays": 2 } } }
```

`{ "maxPlays": 2 }` is a complete policy. `controls` resolves to `"minimal"` and
`seek` to `"none"`, because those are the only values that can keep the promise:
the browser's own bar leaves its play button enabled after a budget is spent, and
a scrubber that moved and silently snapped back would be a control that looks
operable and does nothing. So an enforcing policy replaces the bar with the SDK's
transport — play/pause, elapsed and total time, mute, volume, an optional speed
control, and a live "1 of 2 plays remaining".

| Field | Meaning |
|---|---|
| `maxPlays` (1–20) | How many times the recording may be **started**. Pausing, resuming, and paging between the questions of one listening group are free. |
| `seek: "none"` | No scrubber; an out-of-band seek (an OS media key, a notification-tray scrubber) is reverted and announced. |
| `rate: "fixed"` | No speed control; a rate change from any source is reset and announced. |
| `controls` | `"native"` \| `"minimal"`. Resolved for you; set it only to keep the native bar on a recording that enforces nothing. |
| `nativeControlHints` | `"hide-download"` / `"hide-rate"` — **advisory** `controlsList` tokens for the native bar. |

**What is actually enforced, and what is not.** The SDK does not claim more than
a browser gives, and [`e2e/media-capability-probe.spec.ts`](../packages/lk-react/e2e/media-capability-probe.spec.ts)
is the evidence:

- **Enforced.** A refused play is stopped inside the browser's own `play` event,
  before a sample is audible — verified at `currentTime < 0.25s`. It cannot be
  defeated by a hardware media key or a scripted `play()`, because the budget
  lives on the element's event rather than on the button. Seek reverting and rate
  snapping are enforced the same way.
- **Advisory.** `nativeControlHints` emits `controlsList`, which some engines
  ignore entirely. `hide-download` **never prevents a download** — the URL is in
  the page and the bytes are in the network panel. If a recording must not be
  kept, issue a short-lived signed URL; that is your control, not the SDK's.
- **Never.** Nothing here survives devtools. A client SDK cannot make it.

**A budget is only as durable as your write.** The SDK reads and writes no store,
so `maxPlays` means nothing across a refresh unless you persist it:

```tsx
import { planAttempt, planMediaBudgets, restoreMediaPlayLedger } from '@intellectif/lk-core';

<ActivitySequence
  activities={entries}
  renderMode="exam"
  shuffleSeed={attemptId}
  mediaBudget={{
    plays: restoreMediaPlayLedger(plan, storedLedger).entries,   // read at mount
    onPlayConsumed: async (claim) => {
      // ATOMIC. Two tabs both seeded at 0 both claim 1, and only the server
      // can tell them apart. Returning a count above maxPlays refuses the play.
      const { plays } = await db.incrementPlay(attemptId, claim.key);
      return { playsUsed: plays };
    },
    onPosition: (key, seconds) => saveThrottled(key, seconds),
  }}
/>
```

Return a **promise** and playback is held until your atomic write settles — the
only tier in which "consumed before audible" is true of storage rather than only
of memory. Return **nothing** and playback starts immediately, which is fine for
practice: just do not debounce that write, and do not batch it with the answer
autosave. An eight-second debounce is exactly long enough to start a third play
and hard-reload.

`serializeMediaPlayLedger` / `restoreMediaPlayLedger` bind the counts to their
paper by `planHash`, exactly as `AttemptState` does — the ledger is a **separate**
object on purpose, because a build that predates it would rewrite an
`AttemptState` snapshot without the counts and erase them mid-rollout.

`planAttempt` freezes each budget into the plan, so editing `maxPlays: 2 → 4`
mid-window cannot change what a past learner was held to. It also refuses a paper
where one recording is budgeted under two keys — six questions each carrying the
same clip at `maxPlays: 2` is twelve plays of one recording. Put questions that
share a recording in an **item group**: one stimulus, one budget.

`review` mode never enforces: a graded paper cannot be changed by listening
again, and taking a learner's scrubber and speed control away while they work out
what they got wrong helps nobody.

### Feedback

Two composable layers, both authored by you. The SDK never *writes* feedback, but it does **select** it: since 0.3.0 `score()` and `evaluate()` set `ScoringResult.feedback` to `feedback.correct` or `feedback.incorrect` according to `passed`, so a server scoring headlessly gets the same message the component shows and does not have to reimplement the choice.

1. **Per-item, on the spot** — Multiple Choice `option.feedback`, and Fill-in-the-Blanks per-blank `blank.feedback`. Rendered **inline next to that item, immediately after submission**, colour-keyed by correctness. This is deliberate: immediate, item-localized feedback is the strongest formative-learning signal (vs. an end-of-activity summary).
2. **Activity-level overall** — `feedback: { correct?, incorrect? }`. After submit, the `correct` message shows if the learner passed (score ≥ pass threshold), else `incorrect`, in the activity's `aria-live` region (h5p "Overall Feedback" parity).

```jsonc
// Fill-in-the-Blanks blank with hint + per-blank feedback
{ "id": "evaporation", "acceptedAnswers": ["evaporation"],
  "hint": "Starts with E", "feedback": "Liquid → gas when heated." }
```

**Display & control:** per-item feedback **defaults visible**; the component shows an accessible **"Hide feedback / Show feedback" toggle** (kept operable after submission) so the learner can declutter and restore it without losing results. An aggregate end-of-set summary is a consumer / Phase-2 `ActivitySequence` concern. **Phase 2 (not V1):** score-band ("0–49% / 50–100%") feedback.

The Fill-in-the-Blanks **hint** control renders a default **icon** (the SDK owns the affordance) with a text accessible name (`aria-label` "Show hint"/"Hide hint", `aria-expanded`); restyle/replace the glyph via the `.lk-fib-hint-btn` class — see [styling](./styling.md).

## Building an editor (v0.9)

`validateActivity` answers one question: may this be stored? To that question, a
question an author added a second ago and a broken one get the same answer — no —
so an editor that uses it as its only check reports every new question as an
error. That is how one freshly added, empty question ends up disabling a whole
form's Save button and blanking its preview. Which problems are "not written yet"
and which are "wrong" depends on the activity type, so the SDK says which.

```ts
import { createDraft, validateDraft } from '@intellectif/lk-core';

const draft = createDraft('multiple-choice', { newId: () => crypto.randomUUID() });
// …the author types into it…
const result = validateDraft('multiple-choice', draft);

switch (result.status) {
  case 'complete':   // a valid activity with nothing left to write: result.data
  case 'incomplete': // every issue is something not written yet
  case 'invalid':    // at least one issue is wrong in a way writing more cannot fix
}
```

**There is no `success` field.** A boolean would have to call an incomplete draft
either a success — and a half-written answer key would pass anything that checked
it — or a failure, which is the conflation this exists to remove. Branch on
`status`.

Each issue is a `ValidationError` — `{ path, message, code }` — plus
`severity: 'incomplete' | 'invalid'`, so a UI that already lists
`validateActivity` errors can list these unchanged, and the paths are the ones
`validateActivity` reports.

**Stricter than `validateActivity`, never looser.** `complete` requires the schema
to pass, and a draft can fail here that the schema accepts: a title that is only
whitespace, or a written response with a blank `prompt`. Content stored by an
earlier build can therefore be valid and still not `complete` when it is opened
again. `validateActivity` stays the check at your write boundary; `validateDraft`
is for the editor.

**The messages are English, and address the author.** Translate by `code`. The
codes in the tables below are a contract, and each is always reported with the
severity shown, whichever check reports it. Any other code is not. It is the
schema library's own issue code, passed through with its English message, and
always `invalid`. It comes back for a value of the wrong kind that no row below
describes, such as a `mode` of `"bogus"` or a `shuffle` of `"yes"` — and one such
value can bring more than one issue at the same path — and, for a type you
register, for any schema failure your own `checkDraft` does not report. Give such
a code one generic message of your own, placed by its `path`.

### New drafts

`createDraft(type, { newId })` returns an activity with every required field
present and nothing written, which `validateDraft` reports as `incomplete` and
`validateActivity` rejects. The SDK invents no ids: `newId` is called once per id
— the activity's, and each option's on a multiple-choice question — and must
return a different non-empty string each time. Option ids reach the learner, so
positional ids such as `"a"` and `"b"` would tell them which option was written
first.

| Type | A new draft |
|---|---|
| `multiple-choice` | `mode: 'single'`, `scoringStrategy: 'all-or-nothing'`, two empty options, **none marked correct** |
| `fill-in-the-blanks` | an empty passage, no blanks, `scoringStrategy: 'all-or-nothing'` |
| `written-response` | an empty prompt, `minWords: 0`, `maxWords: 0`, no rubric |

Three of those are decisions:

- **No option is marked correct.** Marking one by default would let an author
  write both options, never touch the correctness control, and hold a `complete`
  question whose answer key is whichever option the default happened to mark.
- **`all-or-nothing`** is the less generous strategy. Partial credit is the
  author's to give.
- **No word limits and no rubric criteria** — those are teaching decisions.
  `maxWords: 0` reads as "not set yet". `minWords: 0` is a real setting, no lower
  limit, and is never reported.

Anything else a new question should start with — `shuffle`, default rubric
criteria, a match policy on new blanks — is yours to spread over the draft.

### What each type reports

Every registered type, reported by `validateDraft` itself:

| Code | Severity | Path | When |
|---|---|---|---|
| `null_not_allowed` | invalid | the field's own path | `null` where the schema accepts none and no code below applies: an optional field, or an entry in a list — an `undefined` entry too, which JSON writes as `null` |

Every built-in activity:

| Code | Severity | Path | When |
|---|---|---|---|
| `schema_version_invalid` | invalid | `schemaVersion` | Not `"1.0"`, or missing |
| `type_mismatch` | invalid | `type` | Not the type being checked, or missing |
| `id_required` | invalid | `id` | The activity has no id |
| `title_required` | incomplete | `title` | Absent, or only whitespace |
| `scoring_strategy_required` | incomplete | `scoringStrategy` | Not set, empty, or only whitespace (multiple choice and fill in the blanks) |
| `pass_threshold_invalid` | invalid | `passThreshold` | Present, and not a number from 0 to 1 |
| `difficulty_level_invalid` | invalid | `difficultyLevel` | Present, and not a whole number from 1 to 5 |
| `feedback_empty` | incomplete | `feedback.correct`, `feedback.incorrect` | An empty string, or only whitespace |
| `redacted_data` | invalid | `redacted` | `redacted: true`: what `redact()` produces for a learner, with the answer key gone, is not a draft |
| `media_type_required` | incomplete | `media.type` | Not chosen yet |
| `media_url_required` | incomplete | `media.url`, `media.captionsUrl` | No address yet: a `url` that is absent, empty or only whitespace, or a `captionsUrl` that is empty or only whitespace |
| `media_url_invalid` | invalid | `media.url`, `media.captionsUrl` | An address the media URL policy refuses, or an embed address that is not absolute http(s) |
| `media_alt_required` | incomplete | `media.alt` | An image or embed with no description, or any media whose description is an empty string or only whitespace |
| `media_playback_invalid` | invalid | `media.playback…` | A playback policy the schema refuses; the message is the schema's |
| `media_invalid` | invalid | `media…` | Any other media problem; the message is the schema's |

`multiple-choice`:

| Code | Severity | Path | When |
|---|---|---|---|
| `mc_question_required` | incomplete | `question` | Absent, or only whitespace |
| `mc_mode_required` | incomplete | `mode` | Not set, empty, or only whitespace |
| `mc_options_too_few` | incomplete | `options` | Fewer than 2 options |
| `mc_options_too_many` | invalid | `options` | More than 26 options |
| `mc_option_text_required` | incomplete | `options.N.text` | Absent, or only whitespace |
| `mc_option_id_required` | invalid | `options.N.id` | Absent, or empty |
| `mc_option_id_duplicate` | invalid | `options` | Two options share an id |
| `mc_option_correctness_required` | incomplete | `options.N.isCorrect` | Not set: nobody has said whether the option is correct |
| `mc_correct_option_required` | incomplete | `options` | No option is marked correct |
| `mc_single_mode_one_correct` | invalid | `options` | `mode: 'single'` with more than one correct option |

`fill-in-the-blanks`:

| Code | Severity | Path | When |
|---|---|---|---|
| `fib_passage_required` | incomplete | `passage` | Absent, or only whitespace |
| `fib_blanks_required` | incomplete | `blanks` | No blanks |
| `fib_blank_id_required` | invalid | `blanks.N.id` | Absent, or empty |
| `fib_accepted_answers_required` | incomplete | `blanks.N.acceptedAnswers` | No accepted answers |
| `fib_accepted_answer_empty` | incomplete | `blanks.N.acceptedAnswers.M` | An accepted answer that is empty or only whitespace |
| `fib_levenshtein_invalid` | invalid | `blanks.N.match.levenshtein` | Not a whole number of 0 or more, or larger than `Number.MAX_SAFE_INTEGER` |
| `fib_match_locale_invalid` | invalid | `blanks.N.match.locale` | A non-empty locale that is not a language tag, such as `"en_US"`. Scoring would throw on it |
| `fib_match_invalid` | invalid | `blanks.N.match…` | Any other matching value the schema refuses, such as a `normalize` of `""`; the message is the schema's |
| `fib_blank_missing` | incomplete | `passage` | A `{{id}}` in the passage with no blank |
| `fib_placeholder_missing` | incomplete | `passage` | A blank whose `{{id}}` is not in the passage |
| `fib_placeholder_duplicate` | invalid | `passage` | The same `{{id}}` more than once |
| `fib_blank_id_duplicate` | invalid | `passage` | Two blanks share an id |
| `fib_blanks_mismatch` | invalid | `passage` | The blanks and placeholders fail to pair one to one in a way no code above names — a blank with no id beside correctly paired ones, for example |

The pairing codes are reported at `passage` because that is where the schema
reports its pairing rule. Each message names the id, except
`fib_blanks_mismatch`'s, which has no single id to name.

`written-response`:

| Code | Severity | Path | When |
|---|---|---|---|
| `wr_prompt_required` | incomplete | `prompt` | Absent, or only whitespace — **even when `promptHtml` is set**, because the plain prompt is what `<WrittenResponse>` renders without a sanitiser |
| `wr_min_words_required` | incomplete | `minWords` | Not set |
| `wr_min_words_invalid` | invalid | `minWords` | Not a whole number of 0 or more, or larger than `Number.MAX_SAFE_INTEGER` |
| `wr_max_words_required` | incomplete | `maxWords` | Not set, or `0` |
| `wr_max_words_invalid` | invalid | `maxWords` | Not a whole number of 1 or more, or larger than `Number.MAX_SAFE_INTEGER` |
| `wr_word_bounds_order` | invalid | `maxWords` | Below `minWords`; the bounds are inclusive, so equal is fine |
| `wr_rubric_criteria_required` | incomplete | `rubric.criteria` | A rubric with no criteria |
| `wr_criterion_name_required` | incomplete | `rubric.criteria.N.name` | Absent, or only whitespace |
| `wr_criterion_weight_required` | incomplete | `rubric.criteria.N.weight` | Not set |
| `wr_criterion_weight_invalid` | invalid | `rubric.criteria.N.weight` | Not a finite number of 0 or more |
| `wr_rubric_weights_zero` | incomplete | `rubric.criteria` | Every weight is 0, so `gradeFromRubric` cannot compute a weighted total |
| `wr_rubric_weights_too_large` | invalid | `rubric.criteria` | The weights add up to more than a number can hold, so `gradeFromRubric` cannot compute a weighted total either |

A rubric weight above 1 is fine: weights are normalised by their sum.

**`null` is a value, not an absence.** A required field that is `null` counts as
not set and gets that field's own code: `title: null` is `title_required`. So does
a field a type requires only sometimes, where it is required: `alt: null` on an
image or an embed is `media_alt_required`. Any other `null` the schema refuses is
`null_not_allowed`, whatever the field's own code would say, because
`validateActivity` would reject the draft. Leave the field out instead. That holds
for optional fields, for entries in lists — an `undefined` entry too, which JSON
writes as `null` — and for every type you register, with two exceptions that keep
the schema's own code: a rule of your type's own that points at a field holding a
`null` the schema accepts, and a `null` inside a member of a plain `z.union`,
which the schema library reports once, at the union's own path, without saying
which member was meant. A `null` inside a member of a `z.discriminatedUnion` is
named.

### Your own activity types

Add `authoring` to a descriptor to give a registered type the same support:

```ts
registerActivityType(defineActivityType<MatchingData, MatchingResponse>({
  type: 'matching',
  schema: MatchingSchema,
  scoring: { kind: 'sync', score: scoreMatching },
  authoring: {
    createDraft: ({ newId }) => ({
      schemaVersion: '1.0', type: 'matching', id: newId(), title: '', pairs: [],
    }),
    // The schema requires a title, so the check reports a missing one: a new
    // draft must come back `incomplete`, never `invalid`.
    checkDraft: (draft) => [
      ...(typeof draft.title !== 'string' || draft.title.trim() === ''
        ? [{ code: 'title_required', severity: 'incomplete' as const, path: ['title'], message: 'Add a title.' }]
        : []),
      ...(Array.isArray(draft.pairs) && draft.pairs.length === 0
        ? [{ code: 'pairs_required', severity: 'incomplete' as const, path: ['pairs'], message: 'Add a pair.' }]
        : []),
    ],
  },
}));
```

Both functions are optional. Without `checkDraft`, `validateDraft` reports every
schema failure as `invalid`. With it, a schema failure is still added, as
`invalid`, unless `checkDraft` reported an issue at that path or inside it — so
report each problem at the path the schema reports it, or an unfinished draft
reads as a wrong one. An issue inside a path accounts for every failure at that
path, a list's length included, so report a rule about a whole list — too many
entries, say — at the list's own path: an issue about one unfinished entry would
otherwise let an over-long list pass for merely unfinished. A failure at the root
of the draft, such as a `.refine()` given no `path`, is accounted for only by an
issue at the root, since every path is inside the root. A `null` the schema
refuses that your check does not report is `null_not_allowed`. `checkDraft`
receives any plain object and must not throw on one. A code from the tables above
is reported with the severity they give it, whatever your check says; for a code
of your own, a severity other than `'incomplete'` is reported as `invalid`.
Calling `createDraft` for a type with no `authoring.createDraft` throws.

For TypeScript to accept your type's name in `validateDraft` and `createDraft`,
add the type to `ActivityDataMap` too, as
[Custom activity types end to end](#custom-activity-types-end-to-end) shows.

`validateDraft` and `createDraft` throw `UnknownActivityTypeError` for a type that
is not registered — including `'item-group'`, which has no draft support.

### Previewing a draft

```tsx
import { ActivityPreview } from '@intellectif/lk-react/components/ActivityPreview';

<ActivityPreview
  draft={draft}                        // whatever the editor holds, finished or not
  renderMode="review"                  // 'practice' | 'exam' | 'review'
  response={{ type: 'multiple-choice', selectedOptionIds: [wrongOptionId] }}
  fallback={(result) => <IssueList issues={result.issues} />}
/>
```

`<ActivityPreview>` (lk-react 8.0.0) runs `validateDraft` before anything renders.
While the draft is not complete it renders `fallback`, or without one a short
notice from the translatable `previewIncomplete` and `previewInvalid` strings, so
each question previews on its own the moment it is complete instead of a whole
preview waiting on every question. It never renders the issue messages: they are
English, and `fallback` is the place to list them in your own words.

A complete draft renders through the same components a learner sees:

- In `practice` and `exam`, `response` seeds the answer and the author can keep
  answering. Nothing is recorded — no callback is wired.
- In `review`, `response` is shown as submitted and marked with `evaluate()`, so
  an author sees exactly how a wrong answer is marked. A written response has no
  score to compute and shows as awaiting its grade; pass `outcome` — for example
  `outcomeFromGrade(grade)` — to preview a returned grade. A response that
  `evaluate()` throws on shows the activity's error fallback, as a failure inside
  the activity would.
- A recording with a play limit enforces it in `practice` and `exam`, counted in
  the preview's memory and stored nowhere, so an author hears the budget a
  learner gets. `review` enforces nothing, as a review never does.

A different `response` or `renderMode` mounts the activity afresh, play count
included, and so does a different recording or playback policy; a new description
of the recording does not. Any other change to the draft's content returns the
answer to what `response` seeds, and keeps the play count.

The draft is compared by content, on every render. A new object holding the same
content changes nothing, whatever order its keys are in, so an editor that
rebuilds its payload on every edit, or reads it back from a JSON column, does not
interrupt the question an author is trying out, and a draft changed in place is
checked again. A key holding `undefined` is content: `{ hint: undefined }` and no
`hint` at all are different drafts. A value JSON cannot describe, such as an
instance of a class or a function, is compared by identity.

A shuffled multiple-choice question uses a fixed seed unless you pass
`shuffleSeed`, so its options hold still while their text is edited; adding or
removing an option deals them again, because the shuffle orders by position.
`renderers` works as it does on `<ActivitySequence>`, and there as here a renderer
is given no seed.

A draft with no string `type`, an unregistered type, and a `response` of a
different type from the draft all throw — the last as soon as it is passed,
however unfinished the draft.

**Not in the SDK:** the form fields, their order and grouping, and any content a
new question starts with beyond the drafts above. There is no field metadata to
generate a form from; the exported JSON Schema is the structural description of
each type.

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

`shuffleSeed` is **required in `exam` and `review` mode**: shuffling without one throws at render, because an order nobody can reproduce cannot be reconciled with the attempt the server recorded, and render time is the last moment that mistake is cheap. In `practice` it stays optional — the pager falls back to a random per-mount seed, stable within the mount and deliberately not reproducible. That fallback is not SSR-safe (server and client would invent different orders and hydration would mismatch), so pass a seed for any server-rendered sequence whatever the mode.

**An activity's own shuffle counts too.** The seed requirement covers every shuffle a sequence can show, not only the ones it performs: an activity that sets `data.shuffle`, a group's items included, also makes `<ActivitySequence>` throw without a `shuffleSeed` in `exam` and `review`. A `<MultipleChoice>` rendered on its own has no such guard: it invents a per-mount seed whenever `data.shuffle` is set and no `shuffleSeed` reaches it, in **every** render mode including `exam`. That renders without complaint and produces a different option order on each mount, which the server cannot rebuild, so pass `shuffleSeed` to a standalone `<MultipleChoice>` that shuffles.

**Not in V1:** auto-advance, submit-gating, aggregate-score UI (compute it with `composeAssessmentScore` from the `onFinished` items).

## Shared stimulus & item groups (v0.5)

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

**Shuffle fairness — `version`.** `seededShuffle(items, seed, { version })` selects the draw. Version 1 (the default) takes the Fisher–Yates index from the low bits of its generator, and those bits are strongly correlated: on a four-option item only 12 of the 24 orders are reachable *for any seed*, and the last authored option lands first 8% of the time against 42% second. Version 2 draws from the high bits and reaches every order uniformly. Version 1 stays the default because these permutations are a wire contract — an attempt may be stored with only its seed, and a review render has to reproduce what the learner saw — so switching it is a package major.

**`version` is only reachable on a direct call.** `flattenSequence`, `planAttempt`, within-group shuffling and `<MultipleChoice>`'s option order all call `seededShuffle` without it and therefore always use version 1, and none of their option bags exposes the setting. So version 2 applies today only to content you order yourself, before handing it to the SDK — passing it to `flattenSequence` is not possible rather than merely ineffective. Threading it through is tracked in the [roadmap](./roadmap.md).

`slotId` is derived from the **authored** position (`"2"` for the third entry, `"2.1"` for the second item of a group in that entry), so it is unique and stable under shuffling — the same activity in two entries is two slots. Record `slots` on the server when the attempt starts, and feed `slotId` to `composeAssessmentScore`. The pager reports the same `slotId` on every `SequenceItemOutcome` and on `onActivityComplete`. `flattenSequence` **requires** a seed whenever anything shuffles and never invents one; the pager's practice-mode fallback and `<MultipleChoice>`'s own option shuffle are the two places a seed is invented (see the shuffling section above), and `<ActivityPreview>` supplies a fixed one of its own when given none. It also **refuses an empty group**: contributing no slots would delete a whole section — stimulus and questions — from a sequence that still looked well-formed, and `composeAssessmentScore` would then report a `final` grade over whatever survived.

> **`slotId` is positional by default — declare `slotKey` for anything you persist.** A `slotKey` is assembly metadata, not content: it survives `redact()`, so an exam client rendering a redacted paper derives the same slot ids the server's plan recorded, and it is excluded from `contentHash` so annotating an item with one is not reported as a content edit. A positional id is stable under shuffling but is an index into *one particular* entries array: insert a question at the top of a published exam and every id below it shifts, so rows stored as `"3"` silently start naming a different question. Give each entry (and each item in a group) an explicit `slotKey` and it is used verbatim, surviving insertion, deletion and re-ordering. Two entries sharing a key is an error, not a merge.

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

`renderMode` is not optional here in practice: all three built-in activities throw at **render** when handed redacted data in the default `practice` mode. `<MultipleChoice>` and `<FillInTheBlanks>` grade locally, so they would otherwise fail inside the submit handler after the learner has answered — where React error boundaries cannot reach. `<WrittenResponse>` never grades on the client, but `practice` still runs its local submit path and emits a practice-mode xAPI statement for work the server is meant to grade, so since lk-react 7.0.0 it refuses redacted data there too.

**Media in a group stops when the learner leaves it.** The pager keeps every question and every stimulus mounted, so answers survive back-navigation; hidden panes are `display: none`, which does **not** stop playback on its own. So the pager pauses any `<audio>`/`<video>` in a pane as that pane hides, preserving `currentTime` — a recording keeps its position between questions of its own group, stops when the learner navigates out of the group, and never auto-resumes. A provider `embed` cannot be controlled this way (that needs the provider's own JS API, and the author supplies the URL), so use `audio`/`video` media for anything that must stop.

**Rendering a stimulus on its own.** `<StimulusPanel stimulus={…} range={{ first: 3, last: 8 }} sanitizeHtml={…} />` is the panel the sequence uses — a landmark region named by the stimulus title (or its kind), showing media, body and attribution. In a sequence it is rendered as a **sibling** of the question region, not inside it, so navigation puts focus on the question while the passage stays a landmark the learner can jump back to. Reach for it in a custom runner that lays out passage and question side by side.

**JSON Schema.** `stimulusJsonSchema` and `itemGroupJsonSchema` describe the container; items appear only as `{ type, id }` there. Each item's contract stays `jsonSchemaFor(type)`, so a generation pipeline asks for the group and its items separately instead of from a copied nested schema.

## Freezing an attempt (v0.6)

A sequence definition is live content — it gets edited, re-ordered, corrected. An attempt is a historical fact. Everything that decides a grade has to be pinned when the attempt *starts*, or a re-grade six months later quietly answers a different question than the learner was asked.

```ts
import { planAttempt, scoredItemsFromPlan, verifyAttemptPlan } from '@intellectif/lk-core';

// When the attempt starts — store this next to the responses.
const plan = planAttempt(entries, {
  seed: attemptId,                 // required if anything shuffles
  shuffleEntries: true,
  points: (slot) => pointsFor(slot.slotId),   // defaults to 1 per slot
});

plan.slots[0];    // { slotId, index, activityId, activityType, points, contentHash, group? }
plan.totalPoints; // the paper's denominator, frozen
plan.planHash;    // one value identifying this exact paper
```

**Points belong to the paper, not to the item.** The same question is worth 1 in a practice quiz and 3 in a final, so `planAttempt` resolves them once and freezes them. Nothing reads points back out of content afterwards.

**Scoring reads the plan, not the answers.**

```ts
const items = scoredItemsFromPlan(plan, outcomesBySlotId);
const result = composeAssessmentScore([{ id: 'reading', weight: 2, items }], policy);
```

The plan is the source of the denominator: building the item list from the *answers* instead is how a paper silently shrinks and the remaining questions become worth more than the exam says.

A slot with no recorded outcome defaults to **`deferred`**, never `unscorable`. The distinction decides a grade — `unscorable` means "a grade is never coming", so the slot leaves the denominator *and* the result is allowed to go `final`, which turns a three-question paper with one answer into a final, passing 100%. `deferred` holds the result `provisional`, so nothing can be recorded. Once you know the attempt was submitted and the blanks are genuinely blanks, say so:

```ts
scoredItemsFromPlan(plan, outcomes, { missing: 'zero' });   // real zeros, result is final
scoredItemsFromPlan(plan, outcomes, { missing: (slot) => … }); // or decide per slot
```

**Ask whether the paper still is the paper.** Ids survive an edit unchanged, so they cannot answer this on their own. Re-plan the current entries with the stored seed and compare:

```ts
// Rebuild with the options the stored plan RECORDED, or the differences you
// see will be your own: omit `shuffleEntries` and a shuffled attempt rebuilds
// in authored order, so every slot reports as re-ordered; omit `points` and
// every slot silently reweights to 1.
const now = planAttempt(currentEntries, {
  seed: storedPlan.seed,
  shuffleEntries: storedPlan.shuffleEntries,
  points: pointsFor,
});
const drift = verifyAttemptPlan(storedPlan, now);

drift.matches;                 // false if anything moved
drift.changedSlotIds;          // this question was edited since
drift.changedStimulusSlotIds;  // the passage under these questions was corrected
drift.changedPointsSlotIds;    // reweighted — moves the grade without touching a question
drift.missingSlotIds;          // questions that no longer exist
drift.reorderedSlotIds;
```

Drift is not automatically a problem — a fixed typo changes a fingerprint without changing what was asked. It is a fact somebody handling a remark or an appeal has to be able to see.

**On `contentHash`.** It is a deterministic, dependency-free fingerprint for *change detection*, not a tamper-evident signature: someone who can edit content could, with effort, preserve it. It catches honest edits, which is what actually happens. If you need the stronger property, sign the plan with a key the content author does not hold.

## Resuming and reviewing an attempt (v0.7)

The plan says what the learner was asked. `AttemptState` says how far they got — and it is bound to the plan, because restoring answers onto a *different* paper is exactly what slot ids alone will happily let you do.

```ts
import {
  serializeAttemptState, restoreAttemptState, diffResponses,
} from '@intellectif/lk-core';

// Autosave.
const snapshot = serializeAttemptState(plan, {
  responses,               // { [slotId]: LearnerResponse }
  submittedSlotIds,
  index,                   // where the learner is standing
  savedAt: new Date().toISOString(),   // the SDK never reads a clock
});

// Resume, later.
const restored = restoreAttemptState(plan, snapshot);   // throws if it is not this paper
```

`serializeAttemptState` validates on the way **in**: a response stored against a slot the paper does not contain is a bug at the moment it is written, and discovering it when a learner tries to resume is discovering it far too late. `restoreAttemptState` re-validates, because a snapshot is storage and storage gets migrated and hand-fixed.

`diffResponses(before, after)` reports what moved between two snapshots — including an answer the learner **cleared**, which comparing the later snapshot alone cannot see. Use it for a delta autosave or an audit trail.

### Putting a learner back where they were

```tsx
<ActivitySequence
  activities={entries}
  shuffleSeed={attemptId}
  defaultIndex={restored.index}                 // reopen on the right question
  responses={restored.responses}                // seed each slot's saved answer
  submittedSlotIds={restored.submittedSlotIds}  // keep committed work committed
  onIndexChange={(index) => save({ index })}
  onSubmit={(response, slot) => save({ [slot.slotId]: response })}
/>
```

The three seed props are read at **mount only** — to show a *different* attempt, remount with a `key`. That is enforced, not merely advised: slot ids are short and repeat across papers (`"0"`, `"1.0"`), so re-applying them after the entries changed would drop one paper's answers under another paper's questions. Seeding stops at the first set change.

`submittedSlotIds` matters on a summative paper. Without it a resumed attempt reopens every question the learner had already committed as answerable, and they can change and re-submit it.

Restored answers stay editable: resume is not a freeze. A stored position the paper no longer has — or one that is not a number at all, which `Number(row.last_index)` produces from a NULL column — is clamped rather than obeyed. `onIndexChange` reports **every** position the pager lands on, including a clamp it had to apply and the reset a set change performs, so what you store never disagrees with what the learner sees.

### Rendering a review

```tsx
<ActivitySequence
  activities={entries}
  renderMode="review"
  shuffleSeed={attemptId}
  responses={attempt.responses}
  outcomes={outcomesBySlotId}   // what the SERVER decided
/>
```

`review` is read-only and never scores: `outcomes` is the only thing that marks correctness, so a review render without it shows the answers and no verdict — which is right, rather than inventing one client-side.

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

**Ungraded work is never a zero.** A `deferred` item is left out of the
denominator and listed in `pendingSlotIds`, and the whole result stays
`provisional` until every item has a grade.

`unscorable` is **not** the same and must not be used for "not answered yet":
it means a grade is never coming, so the slot leaves the denominator *and* the
result is allowed to go `final` — a three-question paper with one answer and
two `unscorable` slots composes to a final, passing 100%. Use `deferred` (or
let [`scoredItemsFromPlan`](#freezing-an-attempt-v06) default to it). A section with nothing graded is
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

// Registration is a RUNTIME act. On its own the compiler still knows nothing
// about `'matching'`, so `validateActivity('matching', …)` and
// `activities={items}` both fail to type-check. The module augmentation is what
// closes that gap — without it you get TS2345 / TS2322, not a runtime error.
declare module '@intellectif/lk-core' {
  interface ActivityDataMap {
    matching: MatchingData;
  }
  interface LearnerResponseMap {
    matching: MatchingResponse;
  }
}

registerActivityType(defineActivityType<MatchingData, MatchingResponse>({
  type: 'matching',
  schema: MatchingSchema,
  scoring: { kind: 'sync', score: scoreMatching },
  fieldPolicy: { /* … */ },
}));

<ActivitySequence activities={items} renderers={{ matching: MatchingItem }} />
```

Both halves are required, and they fail differently: skip `registerActivityType`
and validation/scoring throw `UnknownActivityTypeError` at runtime; skip the
augmentation and the code above does not compile.

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
  - `defaultValue` seeds an uncontrolled component — the one-line way to re-hydrate a partially-answered activity. It is read at mount **and again whenever `data` changes identity**, because that is the retry/reset trigger and resetting to blank would wipe a restored answer the first time a parent re-rendered `activities={raw.map(redact)}`. So a new `data` reference returns the learner to the seeded answer, not to an empty one — and a new React `key` does exactly the same while `defaultValue` / `defaultSubmitted` are still being passed, because the seeds are simply re-read on the fresh mount. A genuinely fresh attempt needs the new `key` **and** the seed props dropped.
  - `value` + `onChange` make the component fully controlled: the rendered answer is *always* yours, so you can autosave a delta, restore an interrupted attempt, or drive a review render.

  ```tsx
  <MultipleChoice
    data={q}
    defaultValue={savedResponse}                 // resume where the learner left off
    onChange={(response) => autosave(q.id, response)}
    onComplete={finish}
  />
  ```

  In a sequence you do not have to wire the slots up one by one. `<ActivitySequence>` takes `responses`, `submittedSlotIds` and `defaultIndex` (since lk-react 6.0.0): the saved answers are seeded per slot, questions the learner already committed stay committed, and the pager reopens on the question they left. Pair it with `serializeAttemptState` / `restoreAttemptState` and the whole attempt round-trips — see **[Resuming and reviewing an attempt](#resuming-and-reviewing-an-attempt-v07)** above for the full flow.

## SSR / React Server Components

All activity components carry `'use client'` and render correctly inside an RSC tree (e.g. Next.js App Router), hydrating on the client. A server-rendered static shell with a separately hydrated island is Phase 2.

## Versioning

Every activity carries `schemaVersion: "1.0"`. V1 ships a single version; a migration framework is introduced only when the first breaking schema change lands.

Scoring carries a stronger contract than the schema: anything that can change a historical grade is a package major. That rule is enforced rather than promised. `@intellectif/lk-core` ships a corpus of frozen grading calls in `vectors/`, replays it against every build in CI, and you can replay the same corpus against the build you install — see [Grade-stability vectors](../packages/lk-core/vectors/README.md).
