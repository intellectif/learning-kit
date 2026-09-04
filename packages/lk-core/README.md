# @intellectif/lk-core

Framework-free TypeScript core of [learning-kit](https://github.com/intellectif/learning-kit): Zod-based **activity schemas**, a pure **scoring engine**, and an **xAPI 1.0.3 statement builder + validator**. Zero React, zero DOM — usable in Node, browsers, edge, or as the data layer behind `@intellectif/lk-react`.

```bash
pnpm add @intellectif/lk-core
# or
npm install @intellectif/lk-core
```

> Already using `@intellectif/lk-react`? It declares `@intellectif/lk-core` as a peer; install both together.

## What's in the box

- **Activity schemas (Zod 4)** for `multiple-choice`, `fill-in-the-blanks` and `written-response`, with semantic refinements (e.g. *at least one correct option*, *single-select ⇒ exactly one correct*, *passage ↔ blank-id bijection*, *image/embed require `alt`*). Loose at every level, so your sidecar fields survive validation.
- **`validateActivity(type, data)`** — the authoritative runtime validator. Returns a typed `{ success, data }` or a structured `{ success: false, errors[] }`.
- **An open type system** — `defineActivityType` / `registerActivityType` make an activity type a *value*, not a hard-coded union member: register one and `validateActivity`, `score`, `evaluate`, `redact` and `jsonSchemaFor` all work for it, with no SDK release.
- **JSON Schema (Draft-7) export** — `jsonSchemaFor(type)` for any registered type (plus the static per-type exports), suitable for form generators or AI prompting.
- **Scoring engine** — `score(activityType, data, response)` returning `{ score ∈ [0,1], maxScore: 1, passed, feedback, details }`. Pure, deterministic, 100 % test coverage enforced.
- **`evaluate(data, response)` → `ItemOutcome`** — the resilient result: `scored`, `deferred` (graded later by an AI or a human), `graded` (the grade came back), or `unscorable`. "Not graded yet" is expressible in the type system and is never conflated with a zero.
- **Deferred grading, both directions** — `GradeRecord`, `gradeFromRubric()` (the weighted total as a pure function of the grader's judgements — never the model's arithmetic; declare `maxScore` per criterion if your grader works out of 100 or out of 9), `outcomeFromGrade()`, `hasGrade()`.
- **Assessment composition** — `composeAssessmentScore()` for weighted, sectioned totals, with a `provisional` status so an unmarked essay never deflates a grade, and `RoundingPolicy` / `roundGrade` / `gte` / `classifyBand` keeping grade rounding and band classification as the two distinct operations they are.
- **Item groups** — `Stimulus` + `ItemGroup` (one passage or recording serving several questions), `flattenSequence()` for seeded, shuffle-atomic presentation order with stable slot identity.
- **`redact()` / `assertRedacted()`** — fail-closed, policy-driven projections that are safe to send to an exam client, with per-type redacted TypeScript types derived from the strict schemas.
- **`matchText()` / `countWords()`** — opt-in matching tolerances (Unicode normalisation, diacritic folding, typo distance) and the canonical word count.
- **`computePassThreshold(data, score, rounding?)`** — single source of truth for pass/fail (default `0.7`; pass a `RoundingPolicy` to compare the way a total is compared).
- **xAPI builder** — `xAPIBuilder.buildAnsweredStatement(...)` / `buildCompletedStatement(...)` emit well-formed xAPI 1.0.3 statements with `crypto.randomUUID()` ids and an ISO-8601 timestamp.
- **xAPI validator** — `validateXAPIStatement(statement)` (Zod-backed; throws in dev, warns in prod).
- **Errors** — `ActivitySchemaError`, `UnknownActivityTypeError` with structured payloads.
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

## Subpath exports

| Import | Contents |
|---|---|
| `@intellectif/lk-core` | Everything (barrel) |
| `@intellectif/lk-core/schemas` | Zod schemas + `validateActivity` + JSON Schema export |
| `@intellectif/lk-core/scoring` | `score`, `evaluate`, `composeAssessmentScore`, rounding, text matching |
| `@intellectif/lk-core/xapi` | `xAPIBuilder`, `XAPIVerb`, `validateXAPIStatement` |

All exports ship as ESM + CJS with `.d.ts` types. Tree-shakeable.

## Documentation

- [Upgrading](https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md) — start here if you are on 0.3.x.
- [Authoring & content storage](https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md) — data model, validation, fetch → validate → render flow.
- [Project README](https://github.com/intellectif/learning-kit#readme) — the full picture, including the React renderers.
- [Contributing](https://github.com/intellectif/learning-kit/blob/main/CONTRIBUTING.md) — adding a new activity type.

## License

MIT © [Intellectif LLC](https://intellectif.com)
