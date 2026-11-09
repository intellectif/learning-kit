# @intellectif/lk-interactive-activities

Contracts and React 19 players for hosted interactive activities in Learning Kit: **What Happens**
and **Cine-Scramble**. A host stores an activity as JSON, validates it, embeds a player, and gets
typed events back.

**No runtime dependencies, no I/O of its own.** The package never fetches, stores or reads media:
the host supplies every URL, keeps the files and decides what to do with each event.

It has two entries:

| Import | What | Needs |
| --- | --- | --- |
| `@intellectif/lk-interactive-activities` | Contracts: template registry, validators, JSON Schemas, drafts, AI authoring specs, styles, fonts, xAPI. No React and no DOM, so a server can validate with it. | `@intellectif/lk-core` |
| `@intellectif/lk-interactive-activities/player` | The players, marked `'use client'` for React Server Component trees. | also `@intellectif/lk-react`, `react` and `react-dom` 19 |

```bash
pnpm add @intellectif/lk-interactive-activities @intellectif/lk-core
# and, where the players render:
pnpm add @intellectif/lk-react react react-dom
```

## Use

```tsx
import { validateInteractiveActivity } from '@intellectif/lk-interactive-activities';
import { InteractiveActivityPlayer } from '@intellectif/lk-interactive-activities/player';

const result = validateInteractiveActivity(stored);
if (!result.success) throw new Error(result.errors.map((e) => e.message).join('\n'));

<InteractiveActivityPlayer
  activity={result.data}
  locale="es" // the buttons' language; the activity's own text keeps its `locale`
  resolveUrl={(asset) => asset.url || `media/${asset.assetKey}`}
  onEvent={(event) => console.log(event)}
  embed={{ postResize: true }}
/>;
```

`InteractiveActivityPlayer` picks the player from `activity.type`; `WhatHappensPlayer` and
`CineScramblePlayer` can also be mounted directly. A new activity (another `id`, or other clips or
scenes) starts the player afresh. Validate stored JSON before rendering it.

Host options, shared by every player:

- **`resolveUrl`** turns an asset reference into a URL: a signed HTTPS URL for hosted playback, or a
  relative path for an offline bundle. Without it the player uses a non-empty `asset.url`, then
  `assetKey`. Return the same URL for the same asset until it really changes (a refreshed
  signature): a new URL reloads that media.
- **`onEvent`** receives typed `PlayerEvent`s: a clip opened, frozen, revealed or completed, the
  supports shown or hidden, an answer shown or hidden again, audio played, a board, scene or activity completed, an
  order checked, the vocabulary opened.
- **`locale`** is the language of the chrome (buttons, labels, announcements), a BCP 47 tag:
  Spanish for any `es` tag (`es`, `es-CO`, `es-419`), otherwise English, the default. It is
  independent of the activity's own `locale`, the language of its content, which sets `lang` and
  `dir` on that content and picks the voice of the spoken answer. The chrome is marked with the
  language it is really written in: asking for `pt-BR` without `strings` gives English, marked `en`.
- **`strings`** replaces the built-in chrome. Precedence: the activity's own `copy` (the editor's
  words), then host `strings`, then the built-in English or Spanish. An `undefined` or empty value
  never blanks a label.
- **`shortcuts`** (default `true`): single-key shortcuts. Turn them off where they clash with a
  screen reader's or the host's keys; Enter and Escape always work, and every shortcut is announced
  with `aria-keyshortcuts`.
- **`reducedMotion`** turns off spatial motion. The system's `prefers-reduced-motion` is always
  respected. Cine-Scramble's looping clips also start paused.
- **`viewport`** (`{ width, height }`) is the space to fit. By default the player fits its
  container's width and the window's height. Landscape draws a 1920×1080 stage scaled to fit; below
  a scale of `MIN_STAGE_SCALE` (0.55), and on portrait screens, it stacks at real CSS sizes, so text
  stays readable and browser zoom enlarges it.
- **`embed: { postResize: true }`** posts `{ type: 'lk-interactive-activity:resize', width, height }`
  to the parent with the player's rendered size whenever it changes; in this mode the landscape stage
  sizes by width, so a host can set the iframe's height from it. A receiving page must check
  `event.source` and `event.origin`. `BBB_WEBSITE_SHARE_SANDBOX` and `BBB_WEBSITE_SHARE_ALLOW` (from the
  root) match BigBlueButton's Website Share iframe; add `allow-same-origin` when the player is served
  from another origin.

Styles are injected and scoped per player: no CSS import or loader is needed. Fonts are the host's
to load (see [Styles](#styles-motion-and-fonts)). Each step's heading takes focus when the step
changes, unless focus is elsewhere on the host page; one polite status region carries the
announcements.

## What Happens

The learner picks a card, watches the clip to its freeze point, answers the question, reveals the
rest, tells the story aloud, compares it with a sample answer and can listen to it.

- The freeze is frame-accurate: playback is checked on every frame (`requestVideoFrameCallback`,
  else every animation frame while playing) and stops one frame before the freeze point. Before the
  reveal the clip cannot be scrubbed past it. A clip that ends before its freeze point freezes on its
  last frame.
- The supports start hidden on every clip, behind a button labelled with the supports label ("To
  help you" by default, or the editor's words). The teacher opens them with the button or H: the
  panel grows and the phrases spring in one after another. Supports that occur in the sample answer
  are underlined there, every time they occur, and only when the supports are switched on.
- "All clips" (or Escape) returns to the cards from any step, focused on the card the learner left.
- **Show answer can be undone.** The same button becomes "Hide answer" in place (A both ways) and
  brings the telling step back exactly as it was: the prompt, and the supports open or closed as the
  learner left them, the open ones springing back in. Focus stays on the button and the status
  region reads the answer, or says it is hidden again; any spoken answer stops. Once the answer has
  been seen, Next is offered beside Show answer, so hiding it is never a dead end.
- Keyboard: R or Enter reveals, H shows or hides the supports, A shows or hides the answer (Enter
  shows it), L listens, N or Enter goes on, Escape goes back. Shortcuts never fire with Ctrl, Cmd or Alt held, nor
  in a text field.
- A clip may carry `captions` (a WebVTT file), shown as a captions track. The video then loads with
  `crossOrigin="anonymous"`, so a file from another origin needs CORS on the video and the captions.
- Listen plays `audio` when its `textHash` is `answerTextHash(answer.text)`: a recording made for an
  older answer is not played. Otherwise it speaks the answer with the system voice, preferring one on
  the device (offline, and nothing leaves it), in the activity's language. Use
  `isAnswerAudioCurrent(clip)` to know when to regenerate a recording.
- A clip with no sample answer ends at the telling step. A reveal that stalls or fails offers Next.
- The speaking step is **practice, never graded**: nothing is recorded or scored.

## Cine-Scramble

The learner puts a scene's 3 to 6 muted, looping clips in story order and checks.

- Clips start in one order for every learner of the same activity and scene (lk-core's
  `orderingStart`), so a teacher and a class see the same "Clip 3", and no clip starts in its place.
  The page numbers clips by that start order, so the markup does not give the order away. The
  activity JSON does carry it (clip ids are story positions): the player checks the order itself.
- Three ways to place a clip: drag it; tap a clip and then a slot; or focus a clip and press a slot
  number, after which focus moves to the next clip, then to Check. Delete or Backspace takes a clip
  out of its slot; placing on a filled slot returns the clip that was there.
- Dragging (native pointer events, one pointer at a time) shows on the whole board: the clip lifts,
  follows the pointer and leans into its movement; the spot it left shows as an outline; the other
  clips step back; the open slots light up and the one beneath the clip grows to receive it. However
  a clip moves, it flies from where it was to where it lands, and the slot that receives it flashes.
  All of it is CSS; reduced motion keeps only the fades. On touch screens the page still scrolls past
  the clips (tap to place; a sideways drag still drags).
- C checks once every clip is placed. Each slot's feedback is in words and an icon as well as
  colour, and the status says how many are right. A correct scene pairs each clip with its caption
  under the story they tell; the next unfinished scene is offered.
- "Pause clips" stops every loop (WCAG 2.2.2); when the browser blocks autoplay, the loops wait
  behind "Play clips". A clip that cannot play says so in place, and once to screen readers.
- An optional vocabulary list opens in a dialog; the activity behind it is inert until it closes.
- It is **practice, never graded**: lk-core reports it as not scored, and an order check reaches
  xAPI only as `success`.

## Templates and validation

```ts
import { validateInteractiveActivity } from '@intellectif/lk-interactive-activities';

const result = validateInteractiveActivity(stored); // any template, read from `type`
if (!result.success) console.error(result.errors); // [{ path, code, message }]
```

- **Every issue has a stable `code`** (`required`, `empty`, `invalid_locale`, `unsafe_url`,
  `freeze_out_of_bounds`, `duplicate_item`, `unknown_template`, …: `ValidationIssueCode`). Branch on
  the code, not the message. An unknown template or schema version is an issue, never an exception.
- **Nothing is fixed silently, and nothing is dropped.** Keys the contract does not know (a host's
  own fields) are kept as they are; the result is a copy, detached from the input.
- **Media URLs must be safe:** a relative path, or an `http(s)`, `blob`, `file` or media `data:` URL
  (`isSafeMediaUrl`). Language tags must be real BCP 47 tags.
- **Drafts:** `createWhatHappensDraft` and `createCineScrambleDraft` (also `template.createDraft`,
  and lk-core's `createDraft`) start an unauthored activity. It is not publishable: `validate()`
  refuses it, and lk-core's `validateDraft` reports it `incomplete`, with codes like
  `wh_video_required`, until it is written and its media uploaded.
- **Media slots:** `template.mediaSlots(data)` lists every file the activity has or needs, required
  or optional, filled or not (`present`), with the clip's aspect and duration: an upload checklist or
  an export manifest. It accepts partial drafts.
- **Learner copies:** after `registerInteractiveActivities()`, lk-core's `redact()` drops the
  authoring fields (`videoPrompt`, `origin`) and keeps the sample answer, which every learner sees
  after speaking; `assertRedacted()` proves a payload is learner-safe. Unknown keys are dropped from a
  learner copy (lk-core's redaction is fail-closed).
- **Grading:** neither template is graded. lk-core's `evaluate()` reports both as `deferred`, its
  only "not scored" kind; nothing is waiting for a grade.

Each template (`whatHappensTemplate`, `cineScrambleTemplate`) carries its validator, a JSON Schema
(`template.jsonSchema`, every field included; `validate()` stays authoritative), `createDraft`, its
media slots, English and Spanish chrome, and an AI authoring spec. `registerTemplate` adds a template
of your own; `registerTemplatePlayer` (from `/player`) lets `InteractiveActivityPlayer` render it.
Load one copy of the package per app: two copies would register the same activity types twice, and
lk-core refuses that.

## Styles, motion and fonts

- **Style presets**, each with a light and a dark token bundle mapped to `--lkia-*` CSS variables
  (`cssVariablesForTokens`, `interactiveActivitiesStylesheet`), every text colour and every dashed
  edge at WCAG AA or better:
  - `default`: a calm classroom look, cool paper ground and chalkboard-green actions, Bricolage
    Grotesque headings over Lexend text (set for reading fluency);
  - `cinema-dark`: a screening room, near-black stage, screen-white captions, projector-amber
    actions, Big Shoulders Display titles over Atkinson Hyperlegible Next.

  No `mode` means the viewer's system setting. Panels are frosted only where a clip's blurred poster
  sits behind them.
- **Motion presets** (`default`, `lively`, `gentle`): CSS-only animations with a reduced-motion
  path. An activity selects one with `style.motionPresetId`; without one, its style preset's own
  motion applies (`gentle` for `cinema-dark`). Animation IDs (`ANIMATION_CATALOG`) describe the
  built-in transitions; they are not chosen one by one. An activity never carries CSS or keyframes.
- **Fonts** from a fixed allow-list: Inter, Source Serif 4, Fraunces, Lexend, Atkinson Hyperlegible
  Next, Bricolage Grotesque, Big Shoulders Display, DM Sans, Figtree and Literata, at 400, 600 and
  700. The package never fetches a font.
  - Hosted playback: load `hostedFontsCssUrl(style)` as a stylesheet.
  - Offline export: fetch `offlineFontExport(style).cssUrl` with a browser's User-Agent (Google
    serves `woff2` only to browsers), read it with `parseGoogleFontsCss(css)`, download each distinct
    `url` to `fonts/<fileName>`, and write `localFontFaceCss(faces)` beside them. Each face keeps its
    unicode range, so every subset bundled is used where it is needed.

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

`template.aiSpec` is plain data for an editor's model: a strict JSON Schema of the **AI-fillable
content** (no empty text, no duplicate supports), the writable dot paths (`[]` means every array
element), count and default rules, prompt fragments, and the style, motion, animation and font
catalogs with labels and descriptions. It leaves out host-owned IDs, media keys and URLs, real
durations and provenance. Strict structured-output modes may drop `minLength`, counts and
`uniqueItems` from a schema; `validate()` enforces them all, so always validate the merged draft.

- **`WHAT_HAPPENS_AI_SPEC`**: 8 clips by default (1–12), predict and tell prompts, sample answers and
  optional supports. Supports need not appear in the answer.
- **`CINE_SCRAMBLE_AI_SPEC`**: 1 scene by default (1–8) of 4 clips (3–6), one caption per clip and an
  optional glossary, from one story brief. No Easy/Hard pairs, Reveal prompts or freeze points.
- **`videoPrompt`** describes one text prompt per video slot: aspect, target length (the host's
  `targetLengthS`), scene, action and continuity, and no text or logos. What Happens also describes
  the surprise the freeze should precede. These guide text generation; they are not calls to a video
  API.
- **`freezeSuggestion`** (What Happens only) describes a freeze point for an uploaded clip, inside
  `0 < freezeAt < durationS`. The host supplies the real duration and runs any analysis; a suggestion
  is provisional until the editor accepts it and the merged clip validates.

The package calls no model and holds no AI client.

## Events and xAPI

```ts
import { playerEventToXapi, type PlayerEvent } from '@intellectif/lk-interactive-activities';

// Use as the player's onEvent. The host picks the actor, the activity, clip
// and scene IRIs, and whether to store or deliver the statement.
const onEvent = (event: PlayerEvent) => {
  const statement = playerEventToXapi(event, {
    actor: {
      objectType: 'Agent',
      account: { homePage: 'https://example.org', name: 'host-session' },
    },
    object: (e) => ({
      id:
        'clipId' in e
          ? `https://example.org/activities/story-1/${e.clipId}`
          : 'https://example.org/activities/story-1',
    }),
    context: { platform: 'example-host', language: 'en' },
  });
  console.log(statement); // The package sends nothing.
};
```

Statements are built with lk-core's validated `xAPIBuilder` (fresh UUID and timestamp). Progress
inside an activity (a clip opened, frozen or completed, a scene completed) is `experienced`; only the
whole activity (`board.completed`, `activity.completed`) is `completed`, with `completion: true`, so
an LRS given one static object never reads one clip as the activity done. Showing or hiding the
supports, hiding the answer again and checking an order are `interacted`; an order check carries its correctness as
`result.success`. **No statement carries a score.** Each event's details are kept under the
`PLAYER_EVENT_XAPI_EXTENSION` context extension. Anonymous playback needs no actor unless the host
opts into xAPI.

## What the host owns

- Validating stored activities before rendering them.
- Media: licensing, upload, signing, duration probing, captions, recorded answers (and their
  `textHash`), offline bundling, and the URLs it passes in.
- Authoring: the editor, the model calls behind the AI specs, and review of what they produce.
- Learner data: identity, storage, xAPI delivery to an LRS, and any progress or reward.

## What it does not do

- No network requests, storage or analytics delivery.
- No media reads or media processing.
- No speech recording or grading; no score anywhere.
- No XP, streaks or other rewards.

## Stability and releases

The package is at 0.x: a `0.x` minor may break, and says what to change. What it promises is in
[Stability](https://github.com/intellectif/learning-kit/blob/main/docs/stability.md#interactive-activities);
its public API is recorded and checked in the repository, and releases follow
[Releasing](https://github.com/intellectif/learning-kit/blob/main/docs/releasing.md).
