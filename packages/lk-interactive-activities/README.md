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
  locale="es" // the buttons' language; the activity's own text keeps its `locale`
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
  `assetKey`. Return the same URL for the same asset until it really changes (a refreshed
  signature): a new URL reloads that media.
- **`onEvent`** receives typed `PlayerEvent`s: a clip opened, frozen, revealed or completed, an answer
  shown, audio played, a board or scene completed, an order checked, the vocabulary opened.
- **`locale`** is the language of the chrome (buttons, labels, announcements), a BCP 47 tag:
  Spanish for any `es` tag (`es`, `es-CO`, `es-419`), otherwise English, the default. It is
  independent of the activity's own `locale`, the language of its content, which sets `lang` and
  `dir` on that content and picks the voice of the spoken answer.
- **`strings`** replaces the built-in chrome. Precedence: the activity's own `copy` (the editor's
  words), then host `strings`, then the built-in English or Spanish.
- **`reducedMotion`** turns off spatial motion. The system's `prefers-reduced-motion` is always
  respected.
- **`viewport`** (`{ width, height }`) is the space to fit. By default the player fits its
  container's width and the window's height. Landscape uses a 1920×1080 stage scaled to fit; narrow
  and portrait spaces stack.
- **`embed: { postResize: true }`** posts `{ type: 'lk-interactive-activity:resize', width, height }`
  to the parent window with the player's rendered size, whenever it changes. A receiving page must
  check `event.source` and `event.origin`. `BBB_WEBSITE_SHARE_SANDBOX` and `BBB_WEBSITE_SHARE_ALLOW`
  match BigBlueButton's Website Share iframe; add `allow-same-origin` when the player is served from
  another origin.

Styles are injected and scoped per player: no CSS import or loader is needed. Fonts are the host's
to load (see [Styles](#styles-motion-and-fonts)).

## What Happens

The learner picks a card, watches the clip to its freeze point, predicts what happens next, reveals
the rest, tells the story aloud, compares it with a sample answer and can listen to it. Optional
supports (useful phrases) are shown while telling; only the ones that appear verbatim in the answer
are underlined.

- The freeze is frame-accurate: playback is checked on every frame (`requestVideoFrameCallback`,
  else every animation frame) and stops one frame before the freeze point, so nothing after it is
  shown. Before the reveal the clip cannot be scrubbed past it.
- "All clips" (or Escape) returns to the cards from any step, including a clip that failed to load.
- Keyboard: R or Enter reveals, A or Enter shows the answer, L listens, N or Enter goes on, Escape
  goes back. Shortcuts never fire with Ctrl, Cmd or Alt held, nor in a text field.
- Playback controls hide after inactivity and come back on pointer or focus. Blocked autoplay and
  unavailable media show a visible fallback.
- Listen plays the supplied audio, or else the system speech voice in the activity's language
  (offline availability depends on the operating system).
- A clip with no sample answer ends at the telling step.
- The speaking step is **practice, never graded**: nothing is recorded or scored.

## Cine-Scramble

The learner puts a scene's 3 to 6 muted, looping clips in order and checks.

- Clips start in one order for every learner of the same activity and scene (lk-core's
  `orderingStart`), so a teacher and a class see the same "Clip 3"; no clip starts in its place.
  Clips are numbered by that start order: the page never carries the answer.
- Three ways to place a clip: drag it (native pointer events; the clip follows the pointer and the
  slot beneath it lights up); tap a clip and then a slot; or focus a clip and press a slot number,
  after which focus moves on to the next clip, then to Check. Delete or Backspace returns a placed
  clip; placing on a filled slot returns the previous clip.
- C checks once every clip is placed. Each slot's feedback is in words and an icon as well as
  colour, and a status line says how many are right. A correct scene pairs each clip with its
  caption, two to a row, under the story they tell; the next unfinished scene is offered.
- An optional vocabulary list opens in a dialog (Escape, Close or a click outside closes it).
- There is no Reveal step and no Easy/Hard caption mode.

## Templates and validation

```ts
import { validateInteractiveActivity } from '@intellectif/lk-interactive-activities';

const result = validateInteractiveActivity(stored); // any template, read from `type`
if (!result.success) console.error(result.errors); // [{ path, message }]
// Or one template: getTemplate('what-happens')?.validate(stored), validateWhatHappensData(stored).
```

An unknown template or schema version is reported as an error at that field, never thrown.

Each template (`whatHappensTemplate`, `cineScrambleTemplate`) carries a validator, a JSON Schema
(`template.jsonSchema`), its media slots (`template.mediaSlots(data)`, for an upload checklist or an
export manifest), English and Spanish chrome, and an AI authoring spec. The registry
(`getTemplate`, `listTemplates`, `registerTemplate`) holds both built-ins; `registerInteractiveActivities()`
also registers the two activity types with lk-core, so lk-core's `validateActivity` knows them.
`createWhatHappensDraft` and `createCineScrambleDraft` start a new activity.

A JSON Schema never replaces `validate()`: freeze points inside the clip, counts, unique IDs, no
empty labels or prompts, no duplicate supports or glossary terms, and the style, motion and font IDs
are checked semantically. Unknown catalog IDs fail validation.

For a learner's copy, lk-core's `redact()` (or `withoutAuthorOnly()`) drops the authoring fields
(`videoPrompt`, `origin`). The sample answer is classified public: every learner is shown it after
speaking. What Happens has no score: lk-core's `evaluate()` reports it as `deferred`, the only
"not scored" kind lk-core has; it is not waiting for a grade.

## Styles, motion and fonts

- **Style presets**, each with a light and a dark token bundle mapped to `--lkia-*` CSS variables
  (`cssVariablesForTokens`, `interactiveActivitiesStylesheet`), every text colour at WCAG AA or better:
  - `default`: a calm classroom look, cool paper ground and chalkboard-green actions, Bricolage
    Grotesque headings over Lexend text (set for reading fluency);
  - `cinema-dark`: a screening room, near-black stage, screen-white captions, projector-amber
    actions, Big Shoulders Display titles over Atkinson Hyperlegible Next.
  Panels are frosted only where a clip's blurred poster sits behind them.
- **Motion presets** (`default`, `lively`, `gentle`): CSS-only animations with a reduced-motion path.
  An activity selects one with `style.motionPresetId`; it never carries its own CSS or keyframes.
- **Fonts** from a fixed allow-list: Inter, Source Serif 4, Fraunces, Lexend, Atkinson Hyperlegible
  Next, Bricolage Grotesque, Big Shoulders Display, DM Sans, Figtree and Literata, each at 400, 600
  and 700. The package never fetches a font: for hosted playback, load `hostedFontsCssUrl(style)` as
  a stylesheet; for an offline export, `offlineFontExport(style)` gives that CDN stylesheet's URL and
  the local file names to bundle, and `localFontFaceCss(files)` the `@font-face` rules for them.
  Google serves `woff2` only to browser user agents, one file per character subset; bundle the Latin
  subset at least.

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
