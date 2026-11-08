# @intellectif/lk-interactive-activities

React player and activity contracts for hosted interactive activities in Learning Kit, starting with What Happens and Cine-Scramble.

This package has no runtime dependencies. It peers on [`@intellectif/lk-core`](https://www.npmjs.com/package/@intellectif/lk-core), [`@intellectif/lk-react`](https://www.npmjs.com/package/@intellectif/lk-react), `react`, and `react-dom`.

```bash
pnpm add @intellectif/lk-interactive-activities @intellectif/lk-core @intellectif/lk-react react react-dom
```

This private workspace package currently ships the template registry (`registerTemplate`, `getTemplate`, `listTemplates`), the What Happens and Cine-Scramble contracts (validators registered with `@intellectif/lk-core`, JSON Schema for AI, and English/Spanish chrome), and the style system: named style and motion catalogs, tokens mapped to `--lkia-*` CSS variables, CSS-only animations with a `prefers-reduced-motion` path, and Google Fonts helpers that build a CDN stylesheet URL for hosted playback and list the files to bundle for an offline export. The React players now ship (M5). It is not published to npm yet.

## Players (private / unpublished)

```tsx
import { InteractiveActivityPlayer } from '@intellectif/lk-interactive-activities';

<InteractiveActivityPlayer activity={activity}
  resolveUrl={asset => asset.url || `media/${asset.assetKey}`}
  onEvent={event => console.log(event)}
  embed={{ postResize: true }} />
```

`WhatHappensPlayer` and `CineScramblePlayer` can also be mounted directly. Contracts remain React-free. Copy priority: host `strings`, activity `copy`, then locale defaults (`en` / `es`). `reducedMotion` disables spatial motion; system reduced-motion is always respected. CSS is injected/scoped per player: no CSS loader or font/media fetching helpers required. Media elements load only the URLs supplied by the host. `resolveUrl` accepts signed HTTPS URLs or offline relative paths; without it the player uses nonempty `asset.url`, then `assetKey`. Host is responsible for payload validation, media licensing, signing and offline bundling. No analytics delivery, scoring for speaking, AI clients or xAPI helpers are included.

Landscape uses a 1920×1080 scaled stage; narrow/portrait viewports stack. Pass `viewport={{ width, height }}` when constraining a player within another view. Optional embed resize notifications post `{ type: 'lk-interactive-activity:resize', width, height }`; a receiving host must validate `event.source` and `event.origin`. Exported BBB sandbox/allow constants match Website Share; append `allow-same-origin` for a player on a different origin than BBB.

What Happens: select a card, watch to the locked freeze point, predict, reveal, tell, show the sample answer, listen and return to the board. Supports are optional; only verbatim matches are underlined. Shortcuts on the player: R/Enter reveal, A/Enter answer, L listen, N/Enter next. Playback controls hide after inactivity (pointer/focus restores them). Blocked autoplay and unavailable media have visible fallbacks. Listen tries supplied audio then the OS speech voice (offline availability depends on the OS).

Cine-Scramble: start, drag clips with native pointer capture or focus a clip and press 1–6 to assign it; Delete/Backspace on a slot returns it to the pool. Replacing a filled slot returns its previous clip. C checks; per-slot textual feedback remains until the next edit. Correct scenes pair each clip with its caption in two-column rows (3–6 clips). Optional vocabulary opens a keyboard-dismissable dialog. Media loops are muted and inline. No Reveal or Easy/Hard mode.

Verification: `pnpm coverage` checks all source with the 80% four-metric floor; `pnpm e2e` runs a self-contained Chromium cross-origin Website Share iframe fixture on port 4176, separate from lk-react's e2e suite. Install Playwright Chromium before first use.
