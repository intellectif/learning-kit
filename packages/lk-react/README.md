# @intellectif/lk-react

React 19 components, hooks, and theming for [learning-kit](https://github.com/intellectif/learning-kit): accessible activity components (Multiple Choice, Fill-in-the-Blanks, Written Response), a resumable in-place question-set pager with **exam** and **review** modes, a CSS-variable theming system with an optional skin, and an xAPI delivery hook.

A lightweight, composable, bring-your-own-backend alternative to H5P — and unlike a
practice-quiz widget, it is built to render a **summative** paper: in `exam` mode the
components never score, never reveal correctness, and are safe to hand a `redact()`
projection that carries no answer key.

```bash
pnpm add @intellectif/lk-react @intellectif/lk-core react react-dom
# or
npm install @intellectif/lk-react @intellectif/lk-core react react-dom
```

> `@intellectif/lk-core`, `react`, and `react-dom` are peer dependencies (React `^19`).

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
    { id: 'tokyo', text: 'Tokyo', isCorrect: true,  feedback: 'Correct!' },
    { id: 'seoul', text: 'Seoul', isCorrect: false, feedback: "That's South Korea." },
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

- **`<MultipleChoice>`** — single / multi select, all-or-nothing or partial scoring, per-option `feedback`, and a deterministic option shuffle seeded by `shuffleSeed` (without one the order is stable for the life of the mount only, and is not reproducible afterwards).
- **`<FillInTheBlanks>`** — `{{id}}` placeholders, case/whitespace options, per-blank `hint` (Show/Hide toggle as an icon), per-blank `feedback` shown inline on submit with a learner-controlled **Hide/Show feedback** toggle, optional `showCorrectAnswers`.
- **`<WrittenResponse>`** — free-text writing with a live word counter and bounds messaging, graded **asynchronously**: it emits an ungraded submission (never a fake zero) and a SUBMITTED-verb xAPI statement, and renders a returned `GradeRecord` in `review` mode with per-criterion scores and inline corrections.
- **`<ActivitySequence>`** — in-place "question set" pager (Previous/Next, "Question X of N", no scrolling, focus-managed). Accepts item groups and keeps their stimulus beside every question; `onSubmit` reports every raw answer with its `slotId`, which is the only response channel an `exam` sequence has. `onFinished` is the completion signal for a set that mixes scored and deferred-graded items, where `onComplete` can never fire.
- **Resume and review a whole attempt** — `<ActivitySequence>` takes `defaultIndex`, `responses` and `submittedSlotIds` (read at mount; remount with a `key` to show a different attempt), so an interrupted paper reopens on the right question with the right answers and already-committed questions still committed. `onIndexChange` reports every position the pager lands on, including a clamp it had to apply. Pass `renderMode="review"` plus server-computed `outcomes` to render a finished attempt read-only. Pairs with `serializeAttemptState` / `restoreAttemptState` in `lk-core`.
- **`renderMode`** — `practice` (default: the component scores locally and reveals correctness), `exam` (never scores, never reveals; submit emits the raw response for the server to grade), `review` (read-only, marks correctness only from an `outcome` you supply). This is the single switch that takes grading off the client.
- **Controlled or uncontrolled** — every activity component follows the React convention: `defaultValue` to seed, `value` + `onChange` to own the answer outright, `defaultSubmitted` to mount an already-committed question as committed.
- **`asRenderable()` / `asRenderableSequence()`** — the one documented bridge from a server's `redact()` projection to the `data` prop, so `as unknown as` stays out of your code.
- **`shuffleSeed`** — one seed drives question order *and* each item's option order, so a review render reproduces exactly the arrangement the learner sat. Shuffling in `exam` / `review` mode **requires** it.
- **`<StimulusPanel>`** — a shared passage / recording / image (an item group's stimulus) as a landmark region; the sequence uses it, and a custom runner can too.
- **`<ActivityPreview>`** — an editor's preview. Renders a draft in any `renderMode` with a simulated `response` (marked with `evaluate()` in `review`), and a translatable notice — or your `fallback`, handed the issues — while `validateDraft` says the draft is not finished. Nothing it renders is recorded, and a recording's play limit is counted in memory only.
- **Custom activity types** — `renderers={{ 'my-type': MyRenderer }}` on the sequence; a key matching a built-in overrides it, so you can replace a bundled renderer without forking the sequencer.
- **Rich text, opt-in** — `sanitizeHtml` renders author-supplied `questionHtml` / `promptHtml`. The SDK ships **no** sanitiser and injects no HTML without one; without it the escaped plain-text field is used. (`FillInTheBlanks` ignores `passageHtml` by design — its passage hosts the answer inputs.)
- **Media per question** — optional `image` / `audio` / `video` / `embed` (YouTube/Vimeo iframe) above the question; alt-text required for `image`/`embed` (WCAG).
- **Playback policy for listening papers** — an audio recording can declare `maxPlays`, `seek: 'none'` and `rate: 'fixed'`. The SDK then renders its own accessible transport (44px targets, a live plays-remaining status, an exhausted button that stays focusable and says why) and enforces the policy from the element's own events, so a hardware media key goes through the budget too. Wire `mediaBudget` on `<ActivitySequence>` to make a play budget survive a refresh.
- **Activity-level overall feedback** — `{ correct, incorrect }` shown after submit (h5p "Overall Feedback" parity).
- **`useXAPI(config)`** — fire-and-forget LRS delivery with retry/backoff for 5xx/network (1 s / 2 s / 4 s), immediate fail on 4xx, never throws.
- **`useActivityState()`** — `idle → in-progress → completed → reviewing` machine with `getTimeSpent()`.
- **`<ThemeProvider>` + `defaults.css`** — `--lk-*` design-token system; automatic dark mode via `prefers-color-scheme` (SSR-safe with `useSyncExternalStore`).
- **`createTailwindTheme(theme)`** — optional Tailwind interop; consume the SDK palette from your own utilities.
- **`<LkIntlProvider>`** — all 52 strings the SDK's own chrome renders, replaceable in one place, with a per-component `strings` prop for the exceptions. Interpolation and plurals are **functions**, not format strings, so your `Intl.PluralRules` does the work and TypeScript checks the arity. `locale` sets `lang` and derives `dir`; the skin uses logical properties, so RTL follows. The SDK ships the mechanism and **English only** — see [docs/i18n.md](https://github.com/intellectif/learning-kit/blob/main/docs/i18n.md).
- **WCAG 2.2 AA** — axe-clean unit + Playwright e2e tests; full keyboard operability; numerically-verified contrast.
- **RSC-compatible** — every component carries `'use client'` and hydrates inside a React Server Component tree.

## Subpath exports

| Import | Contents |
|---|---|
| `@intellectif/lk-react` | Everything (barrel) |
| `@intellectif/lk-react/components/MultipleChoice` | `<MultipleChoice>` (boundary-wrapped) |
| `@intellectif/lk-react/components/FillInTheBlanks` | `<FillInTheBlanks>` (boundary-wrapped) |
| `@intellectif/lk-react/components/WrittenResponse` | `<WrittenResponse>` (boundary-wrapped) |
| `@intellectif/lk-react/components/ActivityPreview` | `<ActivityPreview>` draft preview for editors |
| `@intellectif/lk-react/components/ActivitySequence` | `<ActivitySequence>` question-set pager |
| `@intellectif/lk-react/components/StimulusPanel` | `<StimulusPanel>` shared-stimulus region |
| `@intellectif/lk-react/hooks/useActivityState` | Lifecycle + timing |
| `@intellectif/lk-react/hooks/useXAPI` | LRS delivery (retry, never-throws) |
| `@intellectif/lk-react/i18n/LkIntlProvider` | `<LkIntlProvider>`, `useLkStrings`, `useLkDirection`, `DEFAULT_STRINGS`, `mergeStrings`, `directionForLocale` |
| `@intellectif/lk-react/theme/ThemeProvider` | `<ThemeProvider>`, `darkTheme`, `useTheme`, `createTailwindTheme` |
| `@intellectif/lk-react/theme/defaults.css` | Tokens (required) |
| `@intellectif/lk-react/theme/skin.css` | Optional polished skin |

ESM + CJS + `.d.ts` for every JS entry (the two `.css` entries are plain stylesheets).
Tree-shakeable. Node >= 20, React `^19`. In browsers, the SDK's own code needs `Object.hasOwn` — Chrome and Edge 93, Firefox 92, Safari 15.4 — because output targets ES2022 and nothing is polyfilled.

`asRenderable`, `asRenderableSequence`, `RenderMode`, `ActivityProps` and the other
shared types are exported from the **barrel** (`@intellectif/lk-react`); they have no
subpath of their own.

## Capabilities & limitations

| Concern | Behavior |
|---|---|
| **Scoring** | Pure & deterministic, in `lk-core`; per-activity `all-or-nothing` and `partial`. Weighted totals across items and sections are `composeAssessmentScore`; per-option weighting inside one activity is not implemented. |
| **Grading on the client** | `practice` only. `exam` and `review` never score and never reveal correctness — pass a `redact()` projection and grade server-side. |
| **Feedback** | Per-item (MC per-option, FIB per-blank) shown inline on submit with Hide/Show toggle, + activity-level overall. Score-band feedback is not implemented. |
| **Retry** | Pass a new `data` reference or change the React `key` → the activity resets to **its seeded state**, not to blank. With `defaultValue` / `defaultSubmitted` set, a new `key` and a new `data` reference are indistinguishable: both return the restored answer, still locked as submitted. For a genuinely fresh attempt, change the `key` **and stop passing the seeds**. No built-in button — retry *policy* is yours. |
| **Persistence / resume** | Storage is yours — capture `onSubmit` / `onChange` / `onInteraction` / `onIndexChange` and persist as you wish. Re-hydration is supported at **both** levels: `defaultValue` / `value` + `onChange` on a component (since 2.1.0), and `defaultIndex` / `responses` / `submittedSlotIds` on `<ActivitySequence>` (since 6.0.0). |
| **Rich text** | Rendered only when you pass `sanitizeHtml`; the SDK bundles no sanitiser and injects no HTML without one. `FillInTheBlanks` deliberately **ignores** `passageHtml` — the passage hosts the answer inputs, so it is built from `passage` plus the blanks (dev-mode warning if you pass it). |
| **i18n** | Every SDK-rendered string is replaceable through `<LkIntlProvider>` or a per-component `strings` prop (lk-react 7.1.0); `locale` sets `lang` and names xAPI statements. **No locale but English is bundled** — the SDK ships the mechanism and the English defaults, because it cannot review a translation it does not speak. RTL is supported: the provider derives `dir` from the locale — and declares neither `lang` nor `dir` when you supplied neither, so it cannot flip an RTL host back — and the skin uses logical properties throughout. Thrown errors stay English on purpose — they address the developer, not the learner. |
| **Media** | `<audio>` / `<video>` are paused when the pager navigates away, preserving `currentTime` so a group resumes where the learner left it; nothing ever auto-plays. A provider `embed` (iframe) **cannot** be paused this way — controlling a third-party player needs its own JS API. Use `audio` / `video` for anything that must stop when the learner navigates. |
| **Playback policy** | Audio only. `maxPlays` / `seek` / `rate` are enforced by the SDK's own transport — a refused play is stopped inside the browser's `play` event, before a sample is audible. `nativeControlHints` is **advisory**: it emits `controlsList`, which some engines ignore, and never prevents a download. A budget is durable only if you persist it through `mediaBudget.onPlayConsumed`; the SDK stores nothing. Nothing here survives devtools. Not implemented for `video` or `embed`. |
| **Authoring / content storage / CDN / auth** | Consumer responsibility. The contracts to build an editor on are provided: typed schemas, `validateActivity` and JSON Schema export, `validateDraft` / `createDraft` in `lk-core`, and `<ActivityPreview>` here. |
| **SSR / RSC** | Fully supported; every component carries `'use client'`. |

### Versioning note

`@intellectif/lk-core` is a **peer** dependency, so widening its range is a breaking
change for installs and forces a `lk-react` major. Some majors here — **5.0.0**
is the clearest — are exactly that and change no React API. Others do: 6.0.0
added five `<ActivitySequence>` props, a `restored` arm to `SequenceItemOutcome`
that an exhaustive `switch` must handle, and a changed reset target for
`<MultipleChoice>`. Always read the
[CHANGELOG](https://github.com/intellectif/learning-kit/blob/main/packages/lk-react/CHANGELOG.md)
before assuming a migration is needed.

## Documentation

- [Upgrading](https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md) — start here on any upgrade from 2.x, 3.x, 4.x or 5.x.
- [Changelog](https://github.com/intellectif/learning-kit/blob/main/packages/lk-react/CHANGELOG.md) — every release, with the reasoning.
- [Authoring & content storage](https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md)
- [Styling](https://github.com/intellectif/learning-kit/blob/main/docs/styling.md) — tokens, the skin, overrides, dark mode, Tailwind.
- [Internationalisation](https://github.com/intellectif/learning-kit/blob/main/docs/i18n.md) — the full string surface, precedence, plurals, RTL.
- [Project README](https://github.com/intellectif/learning-kit#readme) — full picture & monorepo layout.

## License

MIT © [Intellectif LLC](https://intellectif.com)
