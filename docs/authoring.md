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
  activities={[q1, q2, q3]}                     // ActivityData[]
  onActivityComplete={(result, index) => persist(result, index)}
  onComplete={(results) => finalize(results)}   // when every item is completed
/>;
```

It renders one question at a time with **Previous / Next**, a "Question X of N" `aria-live` indicator, and moves focus to the new question (keyboard/SR friendly). Navigation is **linear and free** (back/forward, learner-controlled). **Not in V1:** auto-advance, submit-gating, randomization, aggregate-score UI (compute from the `onComplete` results array yourself). These are non-breaking Phase-2 candidates.

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

- Components are **uncontrolled**: in-progress answers live only in component state and are **cleared** when `data` changes (the retry mechanism above).
- **You persist** by capturing `onInteraction` (every selection / blank-fill / hint / submit) and the `onComplete` `ActivityResult`, and writing them to your store (DB, `localStorage`, …). The SDK never reads or writes any store — it is store-agnostic and SSR/RSC-safe.
- **V1 limitation:** there is **no** controlled / `initialResponse` prop. You can persist answers, but you **cannot re-hydrate** a partially-answered activity to *resume* mid-attempt — a remount always starts blank. A "resume" affordance (seeding prior answers) is a planned, non-breaking **Phase 2** addition. If you need resume today, the practical workaround is to treat each session as a fresh attempt and store completed results only.

## SSR / React Server Components

All activity components carry `'use client'` and render correctly inside an RSC tree (e.g. Next.js App Router), hydrating on the client. A server-rendered static shell with a separately hydrated island is Phase 2.

## Versioning

Every activity carries `schemaVersion: "1.0"`. V1 ships a single version; a migration framework is introduced only when the first breaking schema change lands.
