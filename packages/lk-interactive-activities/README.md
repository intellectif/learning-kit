# @intellectif/lk-interactive-activities

React 19 players and activity contracts for hosted interactive activities in Learning Kit: **What
Happens** and **Cine-Scramble**. A host embeds an activity whole, with its own media, and gets typed
player events back.

**No runtime dependencies, no I/O of its own.** The package never fetches, stores or reads media:
the host supplies every URL, keeps the files and decides what to do with each event. It peers on
[`@intellectif/lk-core`](https://www.npmjs.com/package/@intellectif/lk-core),
[`@intellectif/lk-react`](https://www.npmjs.com/package/@intellectif/lk-react), `react` and
`react-dom` (v19).

```bash
pnpm add @intellectif/lk-interactive-activities @intellectif/lk-core @intellectif/lk-react react react-dom
```

## Use

```tsx
import { InteractiveActivityPlayer } from '@intellectif/lk-interactive-activities';

<InteractiveActivityPlayer
  activity={activity}
  resolveUrl={(asset) => asset.url || `media/${asset.assetKey}`}
  onEvent={(event) => console.log(event)}
  embed={{ postResize: true }}
/>;
```

`InteractiveActivityPlayer` picks the player from `activity.type`; `WhatHappensPlayer` and
`CineScramblePlayer` can also be mounted directly. Validate stored JSON before rendering it (see
[Templates](#templates-and-validation)).

Host options, shared by every player:

- **`resolveUrl`** turns an asset reference into a URL: a signed HTTPS URL for hosted playback, or a
  relative path for an offline bundle. Without it the player uses a nonempty `asset.url`, then
  `assetKey`.
- **`onEvent`** receives typed `PlayerEvent`s: a clip opened, frozen, revealed or completed, an answer
  shown, audio played, a board or scene completed, an order checked, the vocabulary opened.
- **`strings`** overrides the chrome's copy. Precedence: host `strings`, then the activity's `copy`,
  then the locale defaults (`en`, `es`).
- **`reducedMotion`** turns off spatial motion. The system's `prefers-reduced-motion` is always
  respected.
- **`viewport`** (`{ width, height }`) constrains the player inside another view; otherwise it
  follows the window. Landscape uses a scaled 1920×1080 stage; narrow and portrait viewports stack.
- **`embed: { postResize: true }`** posts `{ type: 'lk-interactive-activity:resize', width, height }`
  to the parent window. A receiving page must check `event.source` and `event.origin`.
  `BBB_WEBSITE_SHARE_SANDBOX` and `BBB_WEBSITE_SHARE_ALLOW` match BigBlueButton's Website Share
  iframe; add `allow-same-origin` when the player is served from another origin.

Styles are injected and scoped per player: no CSS import or loader is needed.

## What Happens

The learner picks a card, watches the clip to its freeze point, predicts what happens next, reveals
the rest, tells the story aloud, compares it with a sample answer and can listen to it. Optional
supports (useful phrases) are shown while telling; only the ones that appear verbatim in the answer
are underlined.

- Keyboard: R or Enter reveals, A or Enter shows the answer, L listens, N or Enter goes on.
- Playback controls hide after inactivity and come back on pointer or focus. Blocked autoplay and
  unavailable media show a visible fallback.
- Listen plays the supplied audio, or else the system speech voice (offline availability depends on
  the operating system).
- The speaking step is **practice, never graded**: nothing is recorded or scored.

## Cine-Scramble

The learner puts a scene's 3 to 6 muted, looping clips in order and checks.

- Drag with native pointer capture, or focus a clip and press 1–6 to place it. Delete or Backspace
  on a slot returns its clip; placing on a filled slot returns the previous clip.
- C checks. Each slot's feedback is in words as well as colour, and stays until the next edit. A
  correct scene pairs each clip with its caption.
- An optional vocabulary list opens in a keyboard-dismissable dialog.
- There is no Reveal step and no Easy/Hard caption mode.

## Templates and validation

```ts
import {
  getTemplate,
  listTemplates,
  validateWhatHappensData,
} from '@intellectif/lk-interactive-activities';

const template = getTemplate('what-happens');
if (!template) throw new Error('Unknown template');
const result = template.validate(stored); // or validateWhatHappensData(stored)
if (!result.success) console.error(result.errors); // [{ path, message }]
```

Each template (`whatHappensTemplate`, `cineScrambleTemplate`) carries a validator, a JSON Schema
(`template.jsonSchema`), its media slots (`template.mediaSlots(data)`, for an upload checklist or an
export manifest), English and Spanish chrome, and an AI authoring spec. The registry
(`getTemplate`, `listTemplates`, `registerTemplate`) holds both built-ins; `registerInteractiveActivities()`
also registers the two activity types with lk-core, so lk-core's `validateActivity` knows them.
`createWhatHappensDraft` and `createCineScrambleDraft` start a new activity.

A JSON Schema never replaces `validate()`: freeze points inside the clip, counts, unique IDs and the
style, motion and font IDs are checked semantically. Unknown catalog IDs fail validation.

## Styles, motion and fonts

- **Style presets** (`default`, `cinema-dark`) with light and dark token bundles, mapped to `--lkia-*`
  CSS variables (`cssVariablesForTokens`, `interactiveActivitiesStylesheet`).
- **Motion presets** (`default`, `lively`, `gentle`): CSS-only animations with a reduced-motion path.
  An activity selects one with `style.motionPresetId`; it never carries its own CSS or keyframes.
- **Fonts** from a fixed allow-list. `googleFontsCssUrl` builds a CDN stylesheet URL for hosted
  playback; `offlineFontExport` and `googleFontsExportManifest` list the files to bundle for an
  offline export. The package never fetches a font itself.

## AI authoring specs

```ts
import { getTemplate } from '@intellectif/lk-interactive-activities';

const template = getTemplate('what-happens');
if (!template) throw new Error('Unknown template');
const guide = template.aiSpec; // Serializable data: send it with the editor's brief.
// The host calls its own model, merges the generated content into host-owned
// media slots, then checks the complete draft before saving:
const validation = template.validate(mergedDraft);
```

`template.aiSpec` is plain data for an editor's model: a JSON Schema of the **AI-fillable content**,
the writable dot paths (`[]` means every array element), count and default rules, prompt fragments,
and the style, motion, animation and font catalogs with labels and descriptions. It deliberately
leaves out host-owned IDs, media keys and URLs, real durations and provenance; the host assigns
those when it allocates media slots, and merges the generated content before `template.validate()`.

- **`WHAT_HAPPENS_AI_SPEC`**: 8 clips by default (1–12), predict and tell prompts, sample answers and
  optional supports. Supports need not appear in the answer.
- **`CINE_SCRAMBLE_AI_SPEC`**: 1 scene by default (1–8) of 4 clips (3–6), one caption per clip and an
  optional glossary, from one story brief. No Easy/Hard pairs, Reveal prompts or freeze points.
- **`videoPrompt`** describes one text prompt per video slot: aspect, target length, scene, action and
  continuity, and no text or logos. What Happens also describes the surprise the freeze should
  precede. These guide text generation; they are not calls to a video API.
- **`freezeSuggestion`** (What Happens only) describes a freeze point for an uploaded clip, inside
  `0 < freezeAt < durationS`. The host supplies the real duration and runs any analysis; a suggestion
  is provisional until the editor accepts it and the merged clip validates.

The package calls no model and holds no AI client.

## Events and xAPI

```ts
import { playerEventToXapi } from '@intellectif/lk-interactive-activities';
import type { PlayerEvent } from '@intellectif/lk-interactive-activities';

// Use as the player's onEvent. The host picks the actor, stable activity, clip
// and scene IRIs, and whether to store or deliver the statement.
const onEvent = (event: PlayerEvent) => {
  const statement = playerEventToXapi(event, {
    actor: {
      objectType: 'Agent',
      account: { homePage: 'https://example.org', name: 'host-session' },
    },
    object: { id: 'https://example.org/activities/story-1' },
    context: { platform: 'example-host', language: 'en' },
  });
  console.log(statement); // The package sends nothing.
};
```

`object` may also be a function of the event, for clip and scene IRIs. Statements are built with
lk-core's validated `xAPIBuilder` (fresh UUID and timestamp). Progress uses `experienced`; clip, board
and scene completion uses `completed` with `completion: true`; a Cine-Scramble check uses
`interacted` with the order's correctness as `result.success`. **No statement carries a score, and
only an order check carries `success`:** listening, reveals and the speaking step never do. Each event's details are kept under
the `PLAYER_EVENT_XAPI_EXTENSION` context extension. Anonymous playback needs no actor unless the host
opts into xAPI.

## What the host owns

- Validating stored activities before rendering them.
- Media: licensing, upload, signing, duration probing, offline bundling, and the URLs it passes in.
- Authoring: the editor, the model calls behind the AI specs, and review of what they produce.
- Learner data: identity, storage, xAPI delivery to an LRS, and any progress or reward.

## What it does not do

- No network requests, storage or analytics delivery.
- No media reads or media processing.
- No speech recording or grading; no score anywhere.
- No XP, streaks or other rewards.

## Testing

`pnpm coverage` runs the package's tests over all source with an 80% floor on statements, branches,
functions and lines. `pnpm e2e` runs a self-contained Chromium test of a cross-origin Website Share
iframe; install Playwright's Chromium first.

## Stability and releases

The package is at 0.x; what it promises is in
[Stability](https://github.com/intellectif/learning-kit/blob/main/docs/stability.md#interactive-activities),
and its public API is `api/surface.md`. Releases follow
[Releasing](https://github.com/intellectif/learning-kit/blob/main/docs/releasing.md); the first
version of a new package is published by hand, as
[a package added later](https://github.com/intellectif/learning-kit/blob/main/docs/releasing.md#3a-a-package-added-later)
describes.
