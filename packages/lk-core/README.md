# @intellectif/lk-core

Framework-free TypeScript core of [learning-kit](https://github.com/intellectif/learning-kit): Zod-based **activity schemas**, a pure **scoring engine**, **rubric and deferred grading**, **weighted assessment composition**, reproducible **exam attempt plans**, fail-closed **redaction**, and an **xAPI 1.0.3 statement builder + validator**. Zero React, zero DOM — usable in Node, browsers, edge, workers, or as the data layer behind `@intellectif/lk-react`.

It is built for **summative** assessment as much as practice: nothing here grades on the client, "not marked yet" is a first-class outcome that is never conflated with a zero, and every behavioural change that could move a historical grade is opt-in. A frozen corpus of grading vectors ships in the package, fails CI if any of them moves, and can be replayed against the build you install.

```bash
pnpm add @intellectif/lk-core
# or
npm install @intellectif/lk-core
```

> Already using `@intellectif/lk-react`? It declares `@intellectif/lk-core` as a peer; install both together.

## What's in the box

- **Activity schemas** for `multiple-choice`, `fill-in-the-blanks` and `written-response`, with semantic refinements (e.g. *at least one correct option*, *single-select ⇒ exactly one correct*, *passage ↔ blank-id bijection*, *image/embed require `alt`*). Loose at every level, so your sidecar fields survive validation.
- **`validateActivity(type, data)`** — the authoritative runtime validator. Returns a typed `{ success, data }` or a structured `{ success: false, errors[] }`, and **throws `UnknownActivityTypeError` if `type` is not registered** — so guard it when validating a content bank that may carry types this build does not know. `validateItemGroup(data)` is the equivalent for a `Stimulus` + `ItemGroup` container, which `validateActivity` cannot take.
- **An open type system** — `defineActivityType` / `registerActivityType` make an activity type a *value*, not a hard-coded union member: register one and `validateActivity`, `score`, `evaluate`, `redact` and `jsonSchemaFor` all work for it, with no SDK release.
- **JSON Schema (Draft-7) export** — `jsonSchemaFor(type)` for any registered type (plus the static per-type exports), suitable for form generators or AI prompting.
- **Scoring engine** — `score(activityType, data, response)` returning `{ score ∈ [0,1], maxScore: 1, passed, feedback, details }`. Pure, deterministic, 100 % test coverage enforced. It **throws** rather than inventing a number: `DeferredScoringError` for a deferred-graded type (`written-response`), and `RedactedScoringError` when handed a `redact()` projection, which has no answer key. Both are on the documented exam path — use `evaluate()` there, which returns `deferred` / `unscorable` instead of throwing.
- **`evaluate(data, response)` → `ItemOutcome`** — the resilient result: `scored`, `deferred` (graded later by an AI or a human), `graded` (the grade came back), or `unscorable`. "Not graded yet" is expressible in the type system and is never conflated with a zero.
- **Deferred grading, both directions** — `GradeRecord`, `gradeFromRubric()` (the weighted total as a pure function of the grader's judgements — never the model's arithmetic; declare `maxScore` per criterion if your grader works out of 100 or out of 9), `outcomeFromGrade()`, `hasGrade()`.
- **Assessment composition** — `composeAssessmentScore()` for weighted, sectioned totals, with a `provisional` status so an unmarked essay never deflates a grade, and `RoundingPolicy` / `roundGrade` / `gte` / `classifyBand` keeping grade rounding and band classification as the two distinct operations they are.
- **Item groups** — `Stimulus` + `ItemGroup` (one passage or recording serving several questions), `flattenSequence()` for seeded, shuffle-atomic presentation order with stable slot identity. Slot ids are positional by default (`"3"`, `"1.0"`); author a `slotKey` on an entry and its id survives an insert, so a stored response cannot slide onto a different question.
- **Attempt plans** — `planAttempt(entries, { seed, shuffleEntries, points })` freezes the exact paper a learner sat: slot order, per-slot points, a content hash of each item, and a `planHash` over the lot. `verifyAttemptPlan(plan, current)` reports the drift when that content is later edited (`changedSlotIds`, `changedStimulusSlotIds`, `changedPointsSlotIds`, `missingSlotIds`, …) — the thing you need during a remark or an appeal. `scoredItemsFromPlan(plan, outcomes)` turns collected outcomes into the `ScoredItem[]` composition wants, and defaults a slot with **no** outcome to `deferred` rather than silently shrinking the denominator.
- **Attempt state** — `serializeAttemptState(plan, progress)` / `restoreAttemptState(plan, snapshot)` round-trip an interrupted attempt (responses, submitted slots, position) and are **bound to the plan**: restoring answers onto a paper the learner never sat throws instead of succeeding quietly. `diffResponses(before, after)` reports what moved between two snapshots, including an answer the learner *cleared*.
- **Media playback policy** — `media.playback` on an audio recording: `maxPlays`, `seek`, `rate`, and advisory `nativeControlHints`. `resolvePlaybackPolicy()` derives the defaults once so the schema, the plan and the renderer cannot drift. Budgets are frozen into the plan by `planAttempt`, so editing `maxPlays` mid-window cannot change what a past learner was held to, and `planAttempt` refuses a paper where one recording is budgeted under two keys.
- **Play ledger** — `serializeMediaPlayLedger` / `restoreMediaPlayLedger` / `planMediaBudgets`, with `slotMediaKey()` / `stimulusMediaKey()` for the keys. Bound to its paper by `planHash`, and deliberately **separate** from `AttemptState`: a play is charged immediately while answers autosave on a debounce, and a build that predates the ledger would rewrite an `AttemptState` snapshot without the counts and erase them.
- **Content hashing** — `contentHash()` / `canonicalJson()` / `fingerprint()`: deterministic, dependency-free change detection (not a tamper-evident signature).
- **`redact()` / `assertRedacted()`** — fail-closed, policy-driven projections that are safe to send to an exam client, with per-type redacted TypeScript types derived from the strict schemas.
- **`redactItemGroup()` / `assertRedactedItemGroup()`** — the container equivalent, and **not optional**: `redact()` takes a single activity, so mapping a group's items through it and shipping the container leaves `Stimulus.transcript` — the author-only transcript of a listening passage, i.e. the answers — in the payload. Redact a group with `redactItemGroup()`.
- **`matchText()` / `countWords()`** — opt-in matching tolerances (Unicode normalisation, diacritic folding, typo distance) and the canonical word count.
- **`computePassThreshold(data, score, rounding?)`** — single source of truth for pass/fail (default `0.7`; pass a `RoundingPolicy` to compare the way a total is compared).
- **xAPI builder** — `xAPIBuilder.buildAnsweredStatement(...)` / `buildSubmittedStatement(...)` / `buildCompletedStatement(...)` (plus `buildStatement(...)` for any verb) emit well-formed xAPI 1.0.3 statements with a v4 statement id and an ISO-8601 timestamp. Ids use `crypto.randomUUID()` where available and fall back to `crypto.getRandomValues()`, so statements stay well-formed on the non-secure origins `randomUUID` is gated behind.
- **xAPI verbs for async grading** — `XAPIVerb.SUBMITTED` is emitted for work whose grade does not exist yet (`answered` would assert a score nobody computed), and `XAPIVerb.SCORED` is there for the grade that arrives later, often from a different actor. `XAPI_VERB_DISPLAY` supplies the `en-US` labels.
- **`xapiDefinitionFor(data)`** — the xAPI interop descriptor (activity-type IRI, `cmi.interaction` type, `correctResponsesPattern`) for any registered type, so a consumer-registered activity gets correct interop with no component changes. Returns `{}` for an unregistered type, so it is always safe to spread.
- **xAPI validator** — `validateXAPIStatement(statement)` (Zod-backed; throws on an invalid statement in development, warns in production).
- **Errors** — `ActivitySchemaError`, `UnknownActivityTypeError`, `DeferredScoringError` and `RedactedScoringError`, all with structured payloads.
- **Types** — `ActivityData`, `ActivityResult`, `ScoringResult`, `XAPIStatement`, `ThemeTokens`, … all exported with JSDoc.

## Quick example

```ts
import { validateActivity, score, xAPIBuilder } from '@intellectif/lk-core';

const data = await fetch('/api/activities/capital-jp').then((r) => r.json());

const v = validateActivity('multiple-choice', data);
if (!v.success) throw new Error(JSON.stringify(v.errors));

const result = score('multiple-choice', v.data, {
  type: 'multiple-choice',
  selectedOptionIds: ['tokyo'],
});
// result.score === 1, result.passed === true

const statement = xAPIBuilder.buildAnsweredStatement({
  actor: { objectType: 'Agent', mbox: 'mailto:learner@example.com' },
  object: { id: 'urn:learning-kit:activity:capital-jp', name: { 'en-US': data.title } },
  scoringResult: result,
  timeSpentMs: 4200,
  response: 'tokyo',
});
// statement is a valid xAPI 1.0.3 Statement
```

## Running an exam

The example above grades on the client. A summative paper must not — so the client
never receives an answer key, and the score is composed on the server from the plan
it issued.

```ts
import {
  planAttempt, isItemGroup, redact, redactItemGroup,
  scoredItemsFromPlan, composeAssessmentScore,
  serializeAttemptState, restoreAttemptState,
} from '@intellectif/lk-core';

// 1. Server: freeze the paper, and ship a learner-safe projection of it.
const plan = planAttempt(entries, { seed: attemptId, points: (slot) => pointsFor(slot) });

// `entries` may hold item groups as well as activities, and the two redact
// through different functions — `redact()` throws UnknownActivityTypeError on
// a group, because `item-group` is a reserved container, not an activity type.
const forClient = entries.map((entry) =>
  isItemGroup(entry) ? redactItemGroup(entry) : redact(entry),
);  // fail-closed both ways: unclassified fields are dropped, and the
    // group's author-only `stimulus.transcript` goes with them

// 2. Client: render and autosave. (See @intellectif/lk-react's <ActivitySequence>.)
const snapshot = serializeAttemptState(plan, { responses, submittedSlotIds, index, savedAt });
//    ...the tab crashes...
const resumed = restoreAttemptState(plan, snapshot);      // throws unless it is this paper

// 3. Server: grade, then compose. Essays may still be out with a grader.
const result = composeAssessmentScore(
  [{ id: 'paper', weight: 1, items: scoredItemsFromPlan(plan, outcomes) }],
  { passThreshold: 0.6, rounding: { mode: 'half-up', dp: 2 } },
);

result.status;   // 'provisional' while anything is awaiting a grade
result.passed;   // boolean, or null while provisional. Never record a provisional score as final.
```

## Subpath exports

| Import | Contents |
|---|---|
| `@intellectif/lk-core` | Everything (barrel) |
| `@intellectif/lk-core/schemas` | Zod schemas + `validateActivity` + JSON Schema export |
| `@intellectif/lk-core/scoring` | `score`, `evaluate`, `composeAssessmentScore`, rounding, text matching |
| `@intellectif/lk-core/xapi` | `xAPIBuilder`, `XAPIVerb`, `validateXAPIStatement` |

The barrel re-exports everything, and it is the **only** entry point for attempt
plans, attempt state, item groups, redaction, the type registry and content
hashing — those have no subpath of their own.

All exports ship as ESM + CJS with `.d.ts` types. Tree-shakeable; `sideEffects: false`. Node >= 20. In browsers, the SDK's own code needs `Object.hasOwn` — Chrome and Edge 93, Firefox 92, Safari 15.4 — because output targets ES2022 and nothing is polyfilled.
Zod is the single runtime dependency: the package depends on `zod@^3.25` and imports the **Zod 4 API** from its `zod/v4` subpath, so it coexists with an app still on Zod 3.

## Documentation

- [Upgrading](https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md) — start here on any upgrade from 0.3.x, 0.4.x or 0.5.x.
- [Changelog](https://github.com/intellectif/learning-kit/blob/main/packages/lk-core/CHANGELOG.md) — every release, with the reasoning.
- [Grade-stability vectors](https://github.com/intellectif/learning-kit/blob/main/packages/lk-core/vectors/README.md) — the package's grading frozen as data; replay it against the build you install.
- [Authoring & content storage](https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md) — data model, validation, fetch → validate → render flow.
- [Project README](https://github.com/intellectif/learning-kit#readme) — the full picture, including the React renderers.
- [Contributing](https://github.com/intellectif/learning-kit/blob/main/CONTRIBUTING.md) — adding a new activity type.

## License

MIT © [Intellectif LLC](https://intellectif.com)
