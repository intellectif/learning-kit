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

### Class hooks

| Hook | Element |
|---|---|
| `.lk-mc`, `.lk-mc-option`, `.lk-mc-option-feedback` | Multiple Choice container / option / per-option feedback |
| `.lk-fib`, `.lk-fib-passage`, `.lk-fib-blank`, `.lk-fib-answer` | Fill-in-the-Blanks |
| `.lk-media`, `.lk-media-el`, `.lk-media-embed` | Activity media (image/audio/video / iframe wrapper) |
| `.lk-seq`, `.lk-seq-progress`, `.lk-seq-question`, `.lk-seq-nav` | ActivitySequence pager |
| `[aria-live]` (within `.lk-mc` / `.lk-fib`) | Feedback / status region |

State is exposed via `data-correct="true|false"` on options/blanks after submission, and `:has(input:checked)` for selection — style these as needed.

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
