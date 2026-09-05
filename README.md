# Learning Kit

A modern, TypeScript-first SDK for building interactive educational activities with xAPI tracking. A lightweight, composable, **bring-your-own-backend** alternative to H5P, built for React 19.

> **What it is:** a runtime + data contract — schemas, a pure scoring engine, an xAPI builder, and accessible React components.
> **What it is not:** a CMS. Authoring UI, content storage (S3), delivery (CDN), auth, and a learner database are the consuming application's responsibility. See **[Capabilities & limitations](#capabilities--limitations)** and the [Authoring guide](./docs/authoring.md).

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`@intellectif/lk-core`](./packages/lk-core) | Schemas, scoring, rubric & deferred grading, assessment composition, attempt plans, redaction, xAPI (zero runtime deps beyond Zod) | [![npm](https://img.shields.io/npm/v/@intellectif/lk-core.svg?label=%20)](https://www.npmjs.com/package/@intellectif/lk-core) |
| [`@intellectif/lk-react`](./packages/lk-react) | React 19 components, the resumable exam/review pager, hooks, theming, optional skin | [![npm](https://img.shields.io/npm/v/@intellectif/lk-react.svg?label=%20)](https://www.npmjs.com/package/@intellectif/lk-react) |
| `@intellectif/lk-ai` | AI content generation | Phase 3 stub — not published |

`lk-react` declares `lk-core` as a **peer** dependency, so a `lk-core` minor bump forces a `lk-react` major. A `lk-react` major is therefore not by itself evidence of a breaking React API — check its [CHANGELOG](./packages/lk-react/CHANGELOG.md).

## Install (in your app)

```bash
pnpm add @intellectif/lk-core @intellectif/lk-react react react-dom
```

`@intellectif/lk-react` has `@intellectif/lk-core`, `react`, and `react-dom` (v19) as peer dependencies.

## Quick start

```tsx
import type { MultipleChoiceData } from '@intellectif/lk-core';
import { MultipleChoice } from '@intellectif/lk-react/components/MultipleChoice';
import { ThemeProvider } from '@intellectif/lk-react/theme/ThemeProvider';
import { useXAPI } from '@intellectif/lk-react/hooks/useXAPI';
import '@intellectif/lk-react/theme/defaults.css'; // design tokens (required)
import '@intellectif/lk-react/theme/skin.css';     // optional polished skin

const quiz: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'capital-jp',
  title: 'World Capitals',
  question: 'Which city is the capital of Japan?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'tokyo', text: 'Tokyo', isCorrect: true },
    { id: 'seoul', text: 'Seoul', isCorrect: false },
  ],
  feedback: { correct: 'Nicely done!', incorrect: 'Review and try again.' },
};

export function Demo() {
  const { sendStatement } = useXAPI({
    endpoint: 'https://your-lrs.example/xapi/statements',
    auth: { type: 'bearer', token: 'YOUR_TOKEN' },
    activityId: 'https://your-app.example/quiz/capital-jp',
    actor: { objectType: 'Agent', mbox: 'mailto:learner@example.com' },
    onError: (e) => console.error('xAPI send failed', e),
  });

  return (
    <ThemeProvider>
      <MultipleChoice
        data={quiz}
        onComplete={(result) => {
          // result: { score, maxScore, passed, timeSpent, xapiStatement }
          void sendStatement(result.xapiStatement); // never throws
        }}
      />
    </ThemeProvider>
  );
}
```

## Activities & features

- **Multiple Choice** — single / multi select, all-or-nothing or partial scoring, deterministic shuffle (seedable via `shuffleSeed` for server-reproducible order), per-option feedback.
- **Fill-in-the-Blanks** — `{{id}}` placeholders, case/whitespace options, opt-in matching tolerances (`BlankConfig.match`: Unicode NFC, diacritic folding, typo tolerance — defaults reproduce exact matching), per-blank hints (show/hide toggle), `showCorrectAnswers`.
- **Written Response** *(v0.3)* — free-text writing with word-count bounds and an optional rubric, graded **asynchronously** (your AI or human grader): `evaluate()` returns `{ status: 'deferred' }`, the component emits a SUBMITTED-verb xAPI statement with no score, and your app grades out-of-band. Never conflates "ungraded" with 0.
- **Custom types** *(v0.3)* — `defineActivityType` + `registerActivityType` make `validateActivity` / `score` / `evaluate` / `redact` / `jsonSchemaFor` work for your own activity types without an SDK release (TypeScript module augmentation for typing).
- **Server-side redaction** *(v0.3)* — `redact()` produces a learner-safe, fail-closed projection: answer keys, scoring rules and authored feedback are removed, and any field a type's policy does not classify is removed too. **Rubrics are kept by default** — a rubric tells the learner what they are being assessed on, which is the point of publishing one; tighten that per call with `redact(data, { policy: { rubric: 'author-only' } })`. `assertRedacted()` proves a payload is safe to ship to an exam client.
- **`ActivitySequence`** — in-place "question set" pager (Previous / Next, "Question X of N", no scrolling, focus-managed). Resets safely when the activity set changes. Accepts **item groups** — a shared passage or recording kept beside each of its questions.
- **Exam, practice and review modes** *(lk-react 2.1.0; through `ActivitySequence` since 4.0.0)* — `renderMode` is the single switch that takes grading off the client: `exam` never scores and never reveals correctness, `review` renders a finished attempt read-only and marks it only from a server-computed outcome, `practice` (the default) keeps the v1 self-scoring behaviour.
- **Resume an interrupted attempt** *(v0.7)* — `serializeAttemptState` / `restoreAttemptState` round-trip responses, submitted slots and position, bound by a `planHash` so answers can never be restored onto a paper the learner never sat; `ActivitySequence` consumes them through `defaultIndex` / `responses` / `submittedSlotIds`. `diffResponses` reports what moved, including an answer the learner cleared.
- **Attempt plans** *(v0.6)* — `planAttempt()` freezes what a learner was actually served — slot order, per-slot points, a content hash per item — and `verifyAttemptPlan()` reports the drift when the content is edited afterwards. This is what makes a grade defensible at a remark or an appeal.
- **Assessment composition** *(v0.4)* — `composeAssessmentScore()` for weighted, sectioned totals with an explicit `RoundingPolicy`, plus rubric and deferred grading (`gradeFromRubric`, `GradeRecord`, `outcomeFromGrade`). An unmarked essay reports the whole result `provisional` instead of deflating the grade to a zero nobody awarded.
- **Media per question** — optional `image` / `audio` / `video` / `embed` (YouTube/Vimeo iframe) above the question.
- **Feedback** — per-option (Multiple Choice) and activity-level overall (`{ correct, incorrect }`).
- **xAPI 1.0.3** — well-formed statements via `xAPIBuilder`; `useXAPI` delivers them (retry/backoff, never throws).
- **Theming** — `--lk-*` CSS variables + `ThemeProvider` (light/dark), optional skin, `createTailwindTheme`.
- **Accessibility** — WCAG 2.2 AA, axe-clean, keyboard-operable, verified by unit + Playwright e2e.

## Capabilities & limitations

| Concern | Behavior |
|---|---|
| **Scoring** | Pure, deterministic, in `lk-core`. Per-activity: `all-or-nothing` & `partial`. Across items and sections: `composeAssessmentScore` with per-item weights and an explicit rounding policy. Per-*option* weighting inside one activity is not implemented. |
| **Grading on the client** | `practice` mode only. `exam` and `review` never score and never reveal correctness — ship a `redact()` projection and grade server-side. |
| **Feedback** | Per-item (MC per-option, FIB per-blank) shown inline on submit with a Hide/Show toggle, + activity-level overall. Score-band feedback → Phase 2. |
| **Retry** | Supported: pass a new `data` reference or change the React `key` → the activity resets (Req 3.7). It resets to **its seeded state**, not to blank — so on the resume path, with `defaultValue` / `defaultSubmitted` set, a new `key` and a new `data` reference behave identically and both restore the previous, already-submitted answer. A genuinely fresh attempt needs a new `key` **and** the seed props dropped. The SDK ships no retry button; retry *policy* is yours. |
| **Answer persistence / resume** | Storage is yours; **re-hydration is supported end to end**. Every component takes `value` / `defaultValue` / `onChange` (lk-react 2.1.0), and `<ActivitySequence>` takes `responses` / `submittedSlotIds` / `defaultIndex` (lk-react 6.0.0) — so an interrupted attempt reopens on the right question with the right answers, and already-committed questions stay committed. `serializeAttemptState` / `restoreAttemptState` (lk-core 0.7.0) bind that snapshot to the paper it was taken on. Persist via `onSubmit` / `onChange` / `onIndexChange`. See the [authoring guide](./docs/authoring.md#resuming-and-reviewing-an-attempt-v07). |
| **Authoring / content storage / CDN / auth / learner DB** | Consumer responsibility. The SDK gives you typed schemas, `validateActivity`, and JSON Schema export to build authoring on. See [Authoring guide](./docs/authoring.md). |
| **SSR / RSC** | Components are `'use client'`; render correctly inside an RSC tree (hydrate on the client). |

Full detail: **[docs/authoring.md](./docs/authoring.md)** · **[docs/styling.md](./docs/styling.md)** · **[docs/roadmap.md](./docs/roadmap.md)** (release plan, audit-verification results, and standing decisions).

## Documentation

- **[Upgrading](./docs/upgrading.md)** — the `lk-core` ↔ `lk-react` release map, and **read it first if you are below `lk-core@0.6`**: two of the changes there close paths that put a wrong number in front of a learner.
- **[Authoring & content storage](./docs/authoring.md)** — data model, validation, the fetch → validate → render → xAPI flow, retry/persistence patterns, the shared-responsibility boundary.
- **[Styling](./docs/styling.md)** — token system, the optional skin, overriding it, dark mode, Tailwind.
- **[Releasing & publishing](./docs/releasing.md)** — npm token setup, GitHub Actions release, manual publish.
- **Storybook** — `pnpm --filter @intellectif/lk-storybook dev` (or `pnpm dev`), then open `http://localhost:6006`.
- **Runnable example** — [`apps/lk-example-vite`](./apps/lk-example-vite) (Vite + React 19 + MSW mock LRS).

## Requirements

- Node.js 20 or 22 · pnpm 11+ · React 19 (for `lk-react`)

## Monorepo development

```bash
git clone https://github.com/intellectif/learning-kit.git
cd learning-kit
pnpm install
pnpm build      # build all packages
pnpm test       # unit + property tests
pnpm lint       # Biome
pnpm coverage   # coverage (80% gate; 100% for the scoring module)
pnpm dev        # Storybook + example app in watch mode
```

End-to-end (Playwright) tests live in `packages/lk-react/e2e`: `pnpm turbo run build && pnpm turbo run e2e`.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for setup, testing, adding an activity type, and the PR process.

## Releasing

This monorepo uses [Changesets](https://github.com/changesets/changesets) for independent package versioning.

```bash
pnpm changeset          # describe a change
pnpm version-packages   # bump versions from pending changesets
pnpm release            # build + publish (CI handles this on merge to main)
```

`CHANGELOG.md` files are generated per package by Changesets on version bump. Full setup (npm token, CI vs. manual): **[docs/releasing.md](./docs/releasing.md)**.

## License

MIT © [Intellectif LLC](https://intellectif.com)
