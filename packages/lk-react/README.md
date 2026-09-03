# @intellectif/lk-react

React 19 components, hooks, and theming for [learning-kit](https://github.com/intellectif/learning-kit): accessible interactive activity components (Multiple Choice, Fill-in-the-Blanks), an in-place question-set pager, a CSS-variable theming system with an optional skin, and an xAPI delivery hook.

A lightweight, composable, bring-your-own-backend alternative to H5P.

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

- **`<MultipleChoice>`** — single / multi select, all-or-nothing or partial scoring, deterministic per-session shuffle, per-option `feedback`.
- **`<FillInTheBlanks>`** — `{{id}}` placeholders, case/whitespace options, per-blank `hint` (Show/Hide toggle as an icon), per-blank `feedback` shown inline on submit with a learner-controlled **Hide/Show feedback** toggle, optional `showCorrectAnswers`.
- **`<ActivitySequence>`** — in-place "question set" pager (Previous/Next, "Question X of N", no scrolling, focus-managed). Accepts item groups and keeps their stimulus beside every question; `onSubmit` reports every raw answer with its `slotId`, which is the only response channel an `exam` sequence has.
- **`<StimulusPanel>`** — a shared passage / recording / image (an item group's stimulus) as a landmark region; the sequence uses it, and a custom runner can too.
- **Media per question** — optional `image` / `audio` / `video` / `embed` (YouTube/Vimeo iframe) above the question; alt-text required for `image`/`embed` (WCAG).
- **Activity-level overall feedback** — `{ correct, incorrect }` shown after submit (h5p "Overall Feedback" parity).
- **`useXAPI(config)`** — fire-and-forget LRS delivery with retry/backoff for 5xx/network (1 s / 2 s / 4 s), immediate fail on 4xx, never throws.
- **`useActivityState()`** — `idle → in-progress → completed → reviewing` machine with `getTimeSpent()`.
- **`<ThemeProvider>` + `defaults.css`** — `--lk-*` design-token system; automatic dark mode via `prefers-color-scheme` (SSR-safe with `useSyncExternalStore`).
- **`createTailwindTheme(theme)`** — optional Tailwind interop; consume the SDK palette from your own utilities.
- **WCAG 2.2 AA** — axe-clean unit + Playwright e2e tests; full keyboard operability; numerically-verified contrast.
- **RSC-compatible** — every component carries `'use client'` and hydrates inside a React Server Component tree.

## Subpath exports

| Import | Contents |
|---|---|
| `@intellectif/lk-react` | Everything (barrel) |
| `@intellectif/lk-react/components/MultipleChoice` | `<MultipleChoice>` (boundary-wrapped) |
| `@intellectif/lk-react/components/FillInTheBlanks` | `<FillInTheBlanks>` (boundary-wrapped) |
| `@intellectif/lk-react/components/ActivitySequence` | `<ActivitySequence>` question-set pager |
| `@intellectif/lk-react/components/StimulusPanel` | `<StimulusPanel>` shared-stimulus region |
| `@intellectif/lk-react/hooks/useActivityState` | Lifecycle + timing |
| `@intellectif/lk-react/hooks/useXAPI` | LRS delivery (retry, never-throws) |
| `@intellectif/lk-react/theme/ThemeProvider` | `<ThemeProvider>`, `darkTheme`, `useTheme`, `createTailwindTheme` |
| `@intellectif/lk-react/theme/defaults.css` | Tokens (required) |
| `@intellectif/lk-react/theme/skin.css` | Optional polished skin |

ESM + CJS + `.d.ts` for every entry. Tree-shakeable.

## Capabilities & limitations (V1)

| Concern | Behavior |
|---|---|
| **Scoring** | Pure & deterministic; `all-or-nothing` and `partial`. |
| **Feedback** | Per-item (MC per-option, FIB per-blank) shown inline on submit with Hide/Show toggle, + activity-level overall. |
| **Retry** | Pass a new `data` reference or change the React `key` → activity resets (no built-in button — retry *policy* is yours). |
| **Persistence / resume** | Not in the SDK — capture `onInteraction` / `onComplete` and persist as you wish. No `initialResponse` prop in V1 (cannot re-hydrate a partial attempt). |
| **Authoring / content storage / CDN / auth** | Consumer responsibility — typed schemas + `validateActivity` + JSON Schema export are provided for you to build authoring on. |
| **SSR / RSC** | Fully supported. |

## Documentation

- [Authoring & content storage](https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md)
- [Styling](https://github.com/intellectif/learning-kit/blob/main/docs/styling.md) — tokens, the skin, overrides, dark mode, Tailwind.
- [Project README](https://github.com/intellectif/learning-kit#readme) — full picture & monorepo layout.

## License

MIT © [Intellectif LLC](https://intellectif.com)
