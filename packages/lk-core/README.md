# @intellectif/lk-core

Framework-free TypeScript core of [learning-kit](https://github.com/intellectif/learning-kit): Zod-based **activity schemas**, a pure **scoring engine**, and an **xAPI 1.0.3 statement builder + validator**. Zero React, zero DOM — usable in Node, browsers, edge, or as the data layer behind `@intellectif/lk-react`.

```bash
pnpm add @intellectif/lk-core
# or
npm install @intellectif/lk-core
```

> Already using `@intellectif/lk-react`? It declares `@intellectif/lk-core` as a peer; install both together.

## What's in the box

- **Activity schemas (Zod 4)** for `multiple-choice` and `fill-in-the-blanks` with semantic refinements (e.g. *at least one correct option*, *single-select ⇒ exactly one correct*, *passage ↔ blank-id bijection*, *image/embed require `alt`*).
- **`validateActivity(type, data)`** — the authoritative runtime validator. Returns a typed `{ success, data }` or a structured `{ success: false, errors[] }`.
- **JSON Schema (Draft-7) export** — `multipleChoiceJsonSchema` / `fillInTheBlanksJsonSchema`, suitable for form generators or AI prompting.
- **Scoring engine** — `score(activityType, data, response)` returning `{ score ∈ [0,1], maxScore: 1, passed, feedback, details }`. Pure, deterministic, 100 % test coverage enforced.
- **`computePassThreshold(data, score)`** — single source of truth for pass/fail (default `0.7`).
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
| `@intellectif/lk-core/scoring` | `score`, `computePassThreshold` |
| `@intellectif/lk-core/xapi` | `xAPIBuilder`, `XAPIVerb`, `validateXAPIStatement` |

All exports ship as ESM + CJS with `.d.ts` types. Tree-shakeable.

## Documentation

- [Authoring & content storage](https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md) — data model, validation, fetch → validate → render flow.
- [Project README](https://github.com/intellectif/learning-kit#readme) — the full picture, including the React renderers.
- [Contributing](https://github.com/intellectif/learning-kit/blob/main/CONTRIBUTING.md) — adding a new activity type.

## License

MIT © [Intellectif LLC](https://intellectif.com)
