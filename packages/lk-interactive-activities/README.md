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

`WhatHappensPlayer` and `CineScramblePlayer` can also be mounted directly. Contracts remain React-free. Copy priority: host `strings`, activity `copy`, then locale defaults (`en` / `es`). `reducedMotion` disables spatial motion; system reduced-motion is always respected. CSS is injected/scoped per player: no CSS loader or font/media fetching helpers required. Media elements load only the URLs supplied by the host. `resolveUrl` accepts signed HTTPS URLs or offline relative paths; without it the player uses nonempty `asset.url`, then `assetKey`. Host is responsible for payload validation, media licensing, signing and offline bundling. No analytics delivery, scoring for speaking or AI clients are included; local xAPI helpers are opt-in.

Landscape uses a 1920×1080 scaled stage; narrow/portrait viewports stack. Pass `viewport={{ width, height }}` when constraining a player within another view. Optional embed resize notifications post `{ type: 'lk-interactive-activity:resize', width, height }`; a receiving host must validate `event.source` and `event.origin`. Exported BBB sandbox/allow constants match Website Share; append `allow-same-origin` for a player on a different origin than BBB.

What Happens: select a card, watch to the locked freeze point, predict, reveal, tell, show the sample answer, listen and return to the board. Supports are optional; only verbatim matches are underlined. Shortcuts on the player: R/Enter reveal, A/Enter answer, L listen, N/Enter next. Playback controls hide after inactivity (pointer/focus restores them). Blocked autoplay and unavailable media have visible fallbacks. Listen tries supplied audio then the OS speech voice (offline availability depends on the OS).

Cine-Scramble: start, drag clips with native pointer capture or focus a clip and press 1–6 to assign it; Delete/Backspace on a slot returns it to the pool. Replacing a filled slot returns its previous clip. C checks; per-slot textual feedback remains until the next edit. Correct scenes pair each clip with its caption in two-column rows (3–6 clips). Optional vocabulary opens a keyboard-dismissable dialog. Media loops are muted and inline. No Reveal or Easy/Hard mode.

Verification: `pnpm coverage` checks all source with the 80% four-metric floor; `pnpm e2e` runs a self-contained Chromium cross-origin Website Share iframe fixture on port 4176, separate from lk-react's e2e suite. Install Playwright Chromium before first use.

## AI authoring ports (M6)

```ts
import { getTemplate } from '@intellectif/lk-interactive-activities';

const template = getTemplate('what-happens');
if (!template) throw new Error('Unknown template');
const guide = template.aiSpec; // Serializable data: send with the editor brief.
// Host calls its model, merges writable content into host-owned media slots,
// then checks the complete draft before saving:
const validation = template.validate(mergedDraft);
```

`TemplateDefinition.aiSpec` supplies a JSON Schema for **AI-fillable content**, writable dot paths (`[]` means every array element), count/default rules, prompt fragments and catalog IDs/labels/descriptions. The original `template.jsonSchema` remains the complete activity schema; `aiSpec.jsonSchema` deliberately excludes host-owned IDs, media keys/URLs, actual durations and provenance. OCW assigns these when allocating slots and merges generated content before calling `template.validate()`. Neither JSON Schema replaces semantic validation. Unknown style/motion/font IDs fail validation. Animation catalog entries describe packaged transitions; the selectable contract field is `style.motionPresetId`, not arbitrary per-element animation fields. Never generate CSS or keyframes.

`WHAT_HAPPENS_AI_SPEC` defaults to 8 clips (1–12), free-text freeze/post-play speaking prompts, sample answers and optional supports enabled by default. Supports need not appear in the answer. `CINE_SCRAMBLE_AI_SPEC` defaults to 1 scene (1–8) with 4 clips (3–6), one caption per clip and one optional glossary enabled by default, all from one story brief. It generates no Easy/Hard pairs, Reveal prompts or freeze fields.

Each spec's `videoPrompt` describes one prompt per video slot: host/editor aspect and target length in seconds, scene/action/continuity and no text/logos. What Happens also describes the surprise the freeze should precede. These are text-generation guides, not calls to a video API. The host handles model selection, uploads, duration probing, provenance and editor review.

Only What Happens supplies `freezeSuggestion`: post-upload inputs, clip-relative writable fields and exclusive bounds `0 < freezeAt < durationS`. The host supplies actual duration/aspect and orchestrates any model analysis; this package never reads media. Initial generated freeze times are provisional until validated against actual duration. Accept/edit/discard suggestions in the editor and validate the merged clip before saving.

## Local events and xAPI

```ts
import { playerEventToXapi } from '@intellectif/lk-interactive-activities';

// Use as the player's onEvent callback. The host chooses an actor/account,
// stable activity/clip/scene IRIs, and whether to persist or deliver statements.
const onEvent = event => {
  const statement = playerEventToXapi(event, {
    actor: { objectType: 'Agent', account: {
      homePage: 'https://example.org', name: 'host-session',
    } },
    object: { id: 'https://example.org/activities/story-1' },
    context: { platform: 'OCW', language: 'en' },
  });
  console.log(statement); // No sending in the package.
};
```

`PlayerEventXapiContext.object` also accepts `(event: PlayerEvent) => XAPIObjectParams` for host-specific clip/scene IRIs. `playerEventToXapi` calls lk-core's validated `xAPIBuilder`, which stamps a fresh UUID and timestamp. Non-completion observations use `EXPERIENCED`; clip/board/scene completion uses `COMPLETED` with `completion: true`. Only `scramble.checked` uses `INTERACTED` and order correctness as `result.success`. **No statement has a score; speaking, listening, reveal and speaking completion never have success.** All event details (including audio transport) are preserved under the exported `PLAYER_EVENT_XAPI_EXTENSION` context-extension IRI, alongside host context extensions. `PlayerEvent` remains compatible with existing player imports. No network, persistence, speech grading or XP is wired; anonymous playback does not need an actor unless the host opts into xAPI.

Before a milestone handoff, run package tests/coverage (all four metrics ≥80%), lint, typecheck, build and verify-dist, then root `pnpm api-report`, `pnpm api-check` and `pnpm docs-check`. Root gates validate imports and exported API that package tests alone cannot cover.
