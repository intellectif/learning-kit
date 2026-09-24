# Learning Kit

A modern, TypeScript-first SDK for building interactive educational activities with xAPI tracking. A lightweight, composable, **bring-your-own-backend** alternative to H5P, built for React 19.

> **What it is:** a runtime + data contract — schemas, a pure scoring engine, an xAPI builder, and accessible React components.
> **What it is not:** a CMS. Authoring UI, content storage (S3), delivery (CDN), auth, and a learner database are the consuming application's responsibility. See **[Capabilities & limitations](#capabilities--limitations)** and the [Authoring guide](./docs/authoring.md).

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`@intellectif/lk-core`](./packages/lk-core) | Schemas, scoring, rubric & deferred grading, assessment composition, attempt plans, redaction, xAPI (zero runtime deps beyond Zod) | [![npm](https://img.shields.io/npm/v/@intellectif/lk-core.svg?label=%20)](https://www.npmjs.com/package/@intellectif/lk-core) |
| [`@intellectif/lk-react`](./packages/lk-react) | React 19 components, the resumable exam/review pager, hooks, theming, optional skin | [![npm](https://img.shields.io/npm/v/@intellectif/lk-react.svg?label=%20)](https://www.npmjs.com/package/@intellectif/lk-react) |

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
- **Gap Select** *(v0.10/0.11)* — the dropdown cloze: a passage whose gaps the learner fills by choosing from a list, with optional shared word banks so distractors are possible. Not a mode of Fill-in-the-Blanks: a learner picking from a list cannot mistype, so there is no matching tolerance to configure, and redaction inverts — every choice stays visible, only the key is withheld.
- **Dictation** *(v0.13)* — the learner hears a recording and types it; the grade is the character-level similarity of their text to the transcript, with case, punctuation and spacing ignored and a score for every word. A second, slower recording, progressive word hints in practice, accepted alternative transcripts and whole-word equivalences (where a contraction table lives, as content) are all in the data; `alignDictation` and `diffDictationChars` give a review screen the same comparison the grade was made of.
- **Read Aloud** *(v0.14; lk-react 14.0.0)* — the learner reads a text aloud, a pronunciation-assessment engine of your choosing judges the recording, and the SDK turns that judgement into a grade. Graded **asynchronously**, like a written response: your server measures the stored take with `inspectWav`, checks the engine's evidence with `validateSpeechAssessment`, and grades with `gradeReadAloud`, which refuses a take it cannot trust — silence, a mismatched text or recording, an implausible speaking rate — rather than scoring it 0. In the browser, `<ReadAloud>` records a take as 16 kHz mono WAV with `useSpeechRecorder` and hands it to your storage through `recordingBinding`, and `<PronunciationFeedback>` marks the result word by word. The SDK never calls a speech service, holds a key or keeps audio. See the [speech assessment guide](./docs/speech-assessment.md).
- **Interactive video** *(v0.15; lk-react 15.0.0)* — a video that stops at the moments an author chose and asks the learner questions, then carries on. It is not a new activity type: it is an item group with a video stimulus and a `timeline` of quizzes, so every question keeps its own slot, its own response and its own grade, and an older build that drops the timeline still renders the same testlet with the same grades. One quiz can hold several questions; multiple choice, fill-in-the-blanks, gap select, dictation and read-aloud can be embedded. `<InteractiveVideo>` is the player: it pauses at each quiz and draws it over the video, marks each quiz on its progress bar, previews the caption under the pointer, holds a required quiz until it is answered, and remembers where the learner was — while your application keeps the file, the captions endpoint and the storage. **It is a formative tool**, for lessons and practice: deliver official summative exams with `<ActivitySequence>`. See the [interactive video guide](./docs/interactive-video.md).
- **Delivery policies** *(v0.20; lk-react 20.0.0)* — one question, delivered as practice with every hint or as a final with none, without being authored twice. `delivery` on an activity or a whole paper switches off feedback, solutions, hints or AI help; it can only take away, and an empty policy is exactly the default. `planAttempt` records it with the attempt, so a grade says what conditions it was earned under. See [Delivery policies](./docs/delivery.md).
- **Scoring policies** *(v0.21; lk-react 21.0.0)* — "Try again" on a practice question, which try counts (the first, by default, so switching tries on moves no grade), and what a try and a hint cost — subtracted as a fraction of the marks, never below zero, and said to the learner before they ask. The right answer waits until the tries end. `scoring` sits beside `delivery` on an activity or a whole paper, `planAttempt` records it, and `evaluateTries` reaches the same numbers on a server. See [Scoring policies](./docs/scoring.md).
- **AI help for learners** *(v0.17; lk-react 17.0.0)* — "Explain my answer" after grading and "Get a hint" before submit, in multiple choice, fill-in-the-blanks, gap select and dictation (explanations only); and, from v0.22 (lk-react 22.0.0), "Get feedback on my draft" on a written response in practice, whose every correction must quote what the learner wrote, with an indicative score the SDK computes from the rubric and marks "Not a grade." The model is yours: you supply the ports, and the SDK never calls a model or holds a key. It builds the facts your model is given — the item, the answer and its own verdict part by part — refuses an explanation that contradicts the grade and a hint that contains the answer, and marks everything a model wrote. Never in `exam`; an author can switch either off per item with `ai: { hints: false }`. What a call cost rides back on the result and into the record of what the learner was shown, a refusal is reportable without its text, and `@intellectif/lk-core/ai-check` runs your prompts against the SDK's own checks in CI. See the [AI guide](./docs/ai.md).
- **Media as multiple-choice options** *(v0.10)* — a picture or a recording per option, for picture-choice and minimal-pair listening items. `image` and `audio` only: a video or an embed swallows the click that selects the option.
- **Authoring contracts** *(v0.9)* — `validateDraft` tells an unfinished question from a wrong one, per activity type, with a documented issue code for every problem it recognises; `createDraft` starts a new one; `<ActivityPreview>` previews a draft in any mode with a simulated answer. The editor itself stays yours.
- **Media per question** — optional `image` / `audio` / `video` / `embed` (YouTube/Vimeo iframe) above the question.
- **Media playback policy** *(v0.8)* — an audio recording can declare `maxPlays`, `seek` and `rate`, for the listening papers that are unrunnable without them. The SDK renders its own accessible transport and enforces the policy from the element's own events; what a browser only *hints* at (`controlsList`) is named as advisory rather than sold as a guarantee, and an in-repo capability probe is the evidence. Play budgets are frozen into the attempt plan and ride a `planHash`-bound ledger you persist.
- **Feedback** — per-option (Multiple Choice) and activity-level overall (`{ correct, incorrect }`).
- **xAPI 1.0.3** — well-formed statements via `xAPIBuilder`; `useXAPI` delivers them (retry/backoff, never throws).
- **Theming** — `--lk-*` CSS variables + `ThemeProvider` (light/dark), optional skin, `createTailwindTheme`.
- **Accessibility** — WCAG 2.2 AA, axe-clean, keyboard-operable, verified by unit + Playwright e2e.

## Capabilities & limitations

| Concern | Behavior |
|---|---|
| **Scoring** | Pure, deterministic, in `lk-core`. Per-activity: `all-or-nothing` & `partial`. Across items and sections: `composeAssessmentScore` with per-item weights and an explicit rounding policy. Per-*option* weighting inside one activity is not implemented. |
| **Grading on the client** | `practice` mode only. `exam` and `review` never score and never reveal correctness — ship a `redact()` projection and grade server-side. |
| **Speech** | A read-aloud is graded asynchronously. The SDK captures the take in the browser, measures a WAV, checks an assessor's evidence and does the arithmetic; your application stores the recording, calls the assessor, holds its keys and decides every threshold. Assess on your server for anything that counts: evidence a browser posts can be forged. See [docs/speech-assessment.md](./docs/speech-assessment.md). |
| **Feedback** | Per-item (MC per-option, FIB per-blank) shown inline on submit with a Hide/Show toggle, + activity-level overall. Score-band feedback → Phase 2. |
| **Retry** | Supported: pass a new `data` reference or change the React `key` → the activity resets (Req 3.7). It resets to **its seeded state**, not to blank — so on the resume path, with `defaultValue` / `defaultSubmitted` set, a new `key` and a new `data` reference behave identically and both restore the previous, already-submitted answer. A genuinely fresh attempt needs a new `key` **and** the seed props dropped. The SDK ships no retry button; retry *policy* is yours. |
| **Answer persistence / resume** | Storage is yours; **re-hydration is supported end to end**. Every component takes `value` / `defaultValue` / `onChange` (lk-react 2.1.0), and `<ActivitySequence>` takes `responses` / `submittedSlotIds` / `defaultIndex` (lk-react 6.0.0) — so an interrupted attempt reopens on the right question with the right answers, and already-committed questions stay committed. `serializeAttemptState` / `restoreAttemptState` (lk-core 0.7.0) bind that snapshot to the paper it was taken on. Persist via `onSubmit` / `onChange` / `onIndexChange`. See the [authoring guide](./docs/authoring.md#resuming-and-reviewing-an-attempt-v07). |
| **Authoring / content storage / CDN / auth / learner DB** | Consumer responsibility. The SDK gives you typed schemas, `validateActivity`, JSON Schema export, and the draft contracts — `validateDraft`, `createDraft`, `<ActivityPreview>` — to build authoring on. See [Authoring guide](./docs/authoring.md#building-an-editor-v09). |
| **i18n** | Every string the SDK's own chrome renders is replaceable through `<LkIntlProvider>` or a per-component `strings` prop (lk-react 7.1.0), with `lang` and `dir` derived from `locale`. **Only English is bundled**: the mechanism ships, the translations are yours — the SDK will not put words in front of a learner in a language it cannot review. Authored content and thrown developer errors are out of scope by design. See [docs/i18n.md](./docs/i18n.md). |
| **SSR / RSC** | Components are `'use client'`; render correctly inside an RSC tree (hydrate on the client). |

Full detail: **[docs/authoring.md](./docs/authoring.md)** · **[docs/styling.md](./docs/styling.md)** · **[docs/i18n.md](./docs/i18n.md)** · **[docs/roadmap.md](./docs/roadmap.md)** (release plan, audit-verification results, and standing decisions).

## Documentation

- **[Upgrading](./docs/upgrading.md)** — the `lk-core` ↔ `lk-react` release map, and **read it first if you are below `lk-core@0.6`**: two of the changes there close paths that put a wrong number in front of a learner.
- **[Authoring & content storage](./docs/authoring.md)** — data model, validation, the fetch → validate → render → xAPI flow, retry/persistence patterns, the shared-responsibility boundary.
- **[Styling](./docs/styling.md)** — token system, the optional skin, overriding it, dark mode, Tailwind.
- **[Interactive video](./docs/interactive-video.md)** — the timeline model, what can be embedded, the player's props, captions, resume and required quizzes.
- **[Delivery policies](./docs/delivery.md)** — what a school lets a learner see: feedback, solutions, hints and AI help, per paper, recorded with the attempt.
- **[Scoring policies](./docs/scoring.md)** — tries and what hints cost, per paper: "Try again", which try counts, and the arithmetic, on the page and on a server.
- **[AI help for learners](./docs/ai.md)** — connecting your model, where help appears, what it is given, and what the SDK refuses to show.
- **[Speech assessment](./docs/speech-assessment.md)** — the read-aloud item, the evidence an assessor must produce, how a grade is computed, and how a take reaches your storage.
- **[Grade-stability vectors](./packages/lk-core/vectors/README.md)** — lk-core's grading frozen as data: replayed in CI against every build, and runnable in your own test suite.
- **[Internationalisation](./docs/i18n.md)** — the full string surface, precedence, plurals as functions, RTL, and what is deliberately not translated.
- **[Features](./docs/features.md)** — everything supported, and the versions each arrived in.
- **[Releasing & publishing](./docs/releasing.md)** — how a release is cut: Changesets, the release-note template, trusted publishing from GitHub Actions (no npm token).
- **Storybook** — `pnpm --filter @intellectif/lk-storybook dev` (or `pnpm dev`), then open `http://localhost:6006`.
- **Runnable example** — [`apps/lk-example-vite`](./apps/lk-example-vite) (Vite + React 19 + MSW mock LRS).

## Releases & upgrading

- **What is supported, and since when** — [Features](./docs/features.md): every activity and capability, the `lk-core` / `lk-react` versions it arrived in, and its guide.
- **What changed** — [GitHub Releases](https://github.com/intellectif/learning-kit/releases), one per package version, and the same notes in each package's `CHANGELOG.md` (it ships in the npm package, so it is in your `node_modules` too). Notes written since release notes gained a template — every release after lk-core 0.20.0 / lk-react 20.0.0 — start with a one-line summary and **Action required**: `none`, or what to do. Earlier notes lead with the detail; the version map in the upgrading guide says what each one asks of you.
- **How to upgrade** — [Upgrading](./docs/upgrading.md): which `lk-core` goes with which `lk-react`, and a section per release saying what, if anything, you need to change. A `lk-react` major is often only the `lk-core` peer bump; the map says so.
- **Hearing about a release** — on GitHub, **Watch → Custom → Releases**, or subscribe to [the releases feed](https://github.com/intellectif/learning-kit/releases.atom). Better still, let your dependency bot bring each release to you as a pull request, with its notes — and keep the two packages together in one, since they move together:

  ```yaml
  # .github/dependabot.yml — one entry per directory with a package.json
  version: 2
  updates:
    - package-ecosystem: npm
      directory: /
      schedule: { interval: weekly }
      groups:
        learning-kit:
          patterns: ["@intellectif/lk-*"]
  ```

  With Renovate: `"packageRules": [{ "matchPackageNames": ["@intellectif/lk-core", "@intellectif/lk-react"], "groupName": "learning-kit" }]`.

  `lk-core` is still `0.x`, and a caret range on a `0.x` version matches only that minor: `^0.18.0` never installs `0.19.0`. A bot is how you find out there is one.

## Requirements

- Node.js 22 or 24 · pnpm 11+ · React 19 (for `lk-react`)

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
