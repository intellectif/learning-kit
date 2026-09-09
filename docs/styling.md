# Styling

Learning Kit components are **token-driven and skinnable**. They ship semantic HTML + stable class hooks + CSS custom properties; you choose how much visual styling to adopt. Tailwind is **optional** and never required.

## The three layers

1. **Tokens (`defaults.css`)** — required. A single `:root { --lk-* }` block of design tokens (colors, spacing, radius, typography, motion). No element/reset/utility rules — it is purely additive and **cannot collide** with Tailwind preflight or your CSS (the `--lk-*` namespace is disjoint from `--tw-*` / `--color-*`).

   ```ts
   import '@intellectif/lk-react/theme/defaults.css';
   ```

2. **Optional skin (`skin.css`)** — a polished, neutral-monochrome look built **entirely** from the tokens.

   ```ts
   import '@intellectif/lk-react/theme/skin.css';
   ```

   Without it, components are functional but visually minimal (native form controls). With it, you get the look in the example app / Storybook.

3. **Your overrides** — see below. The skin is designed to be overridden with **plain CSS and no `!important`**.

## Overriding the skin

Every skin rule is inside the named cascade layer **`@layer lk-skin`**. By CSS cascade-layer precedence, **unlayered author styles always beat layered styles**. So you override any hook with ordinary CSS:

```css
/* your stylesheet — wins over the skin with no specificity war */
.lk-mc-option { border-radius: 0; }
.lk-fib-blank input { border-color: rebeccapurple; }
```

### Writing direction

The skin is direction-agnostic: it uses logical properties (`margin-inline-start`,
`inset-inline-start`, `padding-inline`) rather than `left` / `right`, so it follows the
`dir` that `<LkIntlProvider>` sets — or the one your own document sets. `defaults.css`
declares no directional properties at all. `e2e/rtl-layout.spec.ts` measures this in a
real browser in both directions, because a physical `margin-left` is invisible to every
other check when the page happens to be left-to-right.

Override with logical properties too, or an RTL learner gets your left-to-right layout
inside a right-to-left page. See [Internationalisation](./i18n.md).

### Class hooks

| Hook | Element |
|---|---|
| `.lk-mc`, `.lk-mc-option`, `.lk-mc-option-feedback` | Multiple Choice container / option / per-option feedback |
| `.lk-fib`, `.lk-fib-passage`, `.lk-fib-blank`, `.lk-fib-answer` | Fill-in-the-Blanks |
| `.lk-fib-hint-btn`, `.lk-fib-hint-icon` | Hint button (default icon) — restyle/replace the glyph here; the accessible name is fixed by the SDK |
| `.lk-fib-blank-feedback`, `.lk-fib-feedback-toggle` | Per-blank feedback note + the Hide/Show feedback toggle |
| `.lk-media`, `.lk-media-el`, `.lk-media-embed` | Activity media (image/audio/video / iframe wrapper) |
| `.lk-wr`, `.lk-wr-prompt`, `.lk-wr-textarea`, `.lk-wr-counter`, `.lk-wr-submit` | Written Response container / prompt / input / word counter / submit |
| `.lk-wr-outcome`, `.lk-wr-grade`, `.lk-wr-grade-feedback`, `.lk-wr-review-flag` | Submitted-but-ungraded notice, and the returned grade block |
| `.lk-wr-criteria`, `.lk-wr-criterion`, `.lk-wr-criterion-name`, `.lk-wr-criterion-score`, `.lk-wr-criterion-comment` | Per-criterion rubric breakdown in `review` mode |
| `.lk-wr-corrections`, `.lk-wr-correction`, `.lk-wr-correction-original`, `.lk-wr-correction-corrected`, `.lk-wr-correction-explanation` | Inline corrections anchored in the learner's text |
| `.lk-stimulus`, `.lk-stimulus-title`, `.lk-stimulus-body`, `.lk-stimulus-range`, `.lk-stimulus-attribution` | Shared stimulus panel (an item group's passage / recording) |
| `.lk-media`, `.lk-media-el`, `.lk-media-embed` | Media block, the element itself, and the responsive embed wrapper |
| `.lk-media[data-controls="minimal"]`, `.lk-media-transport` | The SDK audio transport, rendered when a playback policy has something to enforce |
| `.lk-media-play`, `.lk-media-mute`, `.lk-media-time`, `.lk-media-scrub`, `.lk-media-volume`, `.lk-media-rate` | Transport controls. `.lk-media-play[aria-disabled="true"]` is the exhausted state — styled as unavailable but still focusable, so a learner who tabs to it is told why |
| `.lk-media-plays`, `.lk-media-notice` | Live plays-remaining status (polite) and the refusal / blocked-seek alert (assertive) |
| `.lk-media-confirm`, `.lk-media-confirm-start`, `.lk-media-confirm-cancel` | Last-play confirmation, so a stray press cannot spend the final play |
| `.lk-seq`, `.lk-seq-progress`, `.lk-seq-question`, `.lk-seq-nav` | ActivitySequence pager |
| `.lk-seq-prev`, `.lk-seq-next`, `.lk-seq-slot`, `.lk-seq-stimulus`, `.lk-seq-unsupported` | Pager buttons, the per-question pane, its stimulus wrapper, and the fallback for an unregistered activity type |
| `[aria-live]` (within `.lk-mc` / `.lk-fib`) | Feedback / status region |

State is exposed via `data-correct="true|false"` after submission, but **not at the same level for both types**: on Multiple Choice it lands on `.lk-mc-option` itself, while on Fill-in-the-Blanks it lands on the `input` *inside* `.lk-fib-blank`. So target `.lk-mc-option[data-correct="false"]` but `.lk-fib-blank input[data-correct="false"]` — a rule written against `.lk-fib-blank[data-correct]` silently never matches. (The bundled skin does exactly this; compare its `.lk-mc-option` and `.lk-fib-blank input` rules.) `:has(input:checked)` is for Multiple Choice selection.

**The marking contract after submit.** Hue says correctness; *weight* says whether the learner chose it. A correct **and chosen** option is a solid green border with a tint and a `✓`; a wrong-and-chosen option is solid red with a tint and a `✗`; the correct answer the learner **missed** is the same green but **dashed**, with a hollow `○` and no fill — the key revealed, not a win. Untouched distractors recede to 70% opacity, which keeps the default text above AA (6.6:1). The glyphs are CSS generated content declared decorative (`content: "✓" / ""`): they satisfy WCAG 1.4.1 for sighted users without baking English into the stylesheet, and a translatable screen-reader announcement is the component's job. Override any of it with an unlayered rule on the same selectors.

## Theming with `ThemeProvider`

`ThemeProvider` injects token **values** as scoped CSS variables on a wrapper, so the skin (and your token-based CSS) restyle automatically.

```tsx
import { ThemeProvider, darkTheme } from '@intellectif/lk-react/theme/ThemeProvider';

<ThemeProvider theme={{ '--lk-color-primary': '#7c3aed', '--lk-radius-base': '0.75rem' }}>
  <App />
</ThemeProvider>;
```

- **Dark mode:** if no `theme` prop is set and the OS is in `prefers-color-scheme: dark`, the bundled `darkTheme` is applied automatically (SSR-safe via `useSyncExternalStore`). Pass `theme={darkTheme}` to force it.
- **Per-instance:** every activity component also accepts a `theme` prop for one-off token overrides.
- `useTheme()` returns the active tokens for building matching custom UI.

Both the light and dark default palettes are verified to meet **WCAG 2.2 AA** contrast (numeric test in `lk-react`).

## Tailwind (optional)

Tailwind is not needed. If you already use it and want your **own** utilities to share the SDK palette, spread `createTailwindTheme` into `theme.extend`:

```ts
// tailwind.config.ts
import { createTailwindTheme } from '@intellectif/lk-react/theme/ThemeProvider';

export default {
  theme: { extend: createTailwindTheme({}) }, // → colors/spacing/borderRadius/fontFamily/fontSize
};
// usage: class="bg-lk-primary text-lk-surface rounded-lk-base"
```

Each entry is a `var(--lk-*, <fallback>)` reference, so utilities respond live to `ThemeProvider` / dark mode **and** work with zero setup. This styles *your* markup — it does not restyle the SDK's internals (use the class hooks above for that). `defaults.css` is Tailwind-preflight-safe by contract.

## Recommended setups

- **Just want it to look good:** import `defaults.css` + `skin.css`, optionally wrap in `ThemeProvider` with a few brand token overrides.
- **Full custom design:** import `defaults.css` only, skip the skin, write your own CSS against the class hooks using the `--lk-*` tokens.
- **Tailwind shop:** import `defaults.css` (+ skin if desired), add `createTailwindTheme` for your own components.
