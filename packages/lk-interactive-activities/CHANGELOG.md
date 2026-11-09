# @intellectif/lk-interactive-activities

## 0.3.0

### Minor Changes

- [#189](https://github.com/intellectif/learning-kit/pull/189) [`848d43c`](https://github.com/intellectif/learning-kit/commit/848d43cd21ec1b22bd897eb3eaf632c694ef41b0) Thanks [@diego28e](https://github.com/diego28e)! - **What Happens: Show answer can be undone, with "Hide answer" bringing the supports back as they were.**

  **Action required:** none, unless your `onEvent` handler switches over every `PlayerEvent` type; then add the new `answer.hidden`.

  - **One button, both ways.** "Show answer" becomes "Hide answer" in place, and A works both ways. Hiding brings the telling step back exactly as it was: the prompt, and the supports open or closed as the learner left them, the open ones springing back in one after another. Any spoken answer stops.
  - **Nobody loses their place.** Focus stays on the button, and the status region reads the answer out, or says it is hidden again. Pressed from anywhere else, A moves focus to the step's heading as before.
  - **Never a dead end.** Once the answer has been seen, Next is offered beside Show answer. Every clip starts with its answer unseen.
  - **Editors' words.** The new `copy.hideAnswer` and `copy.answerHidden` labels, in English and Spanish, can be renamed like every other label.
  - **xAPI.** `answer.hidden` is `interacted`, with no score.
  - **A changed.** A clip with no sample answer no longer treats A as "go on"; N and Enter do, as its button already said.
  - **Fix.** On a phone, the "Sample answer" label is a small label again instead of a second large heading.

  Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-interactive-activities/README.md#what-happens

## 0.2.0

### Minor Changes

- [#187](https://github.com/intellectif/learning-kit/pull/187) [`9c28f1c`](https://github.com/intellectif/learning-kit/commit/9c28f1c6513fdbefecc3a0cbd708488fdf6cebdb) Thanks [@diego28e](https://github.com/diego28e)! - **Interactive activities 0.2: a server-safe contracts entry, players under `/player`, and the fixes of a full audit.**

  **Action required:** import the players from `@intellectif/lk-interactive-activities/player`; the package root now holds only the contracts and no React. A new draft is no longer publishable until it is written, Cine-Scramble is no longer graded by lk-core, clip and scene completion is now `experienced` in xAPI, and a recorded answer plays only when `audio.textHash` is `answerTextHash(answer.text)`.

  - **Entries.** The root (validators, JSON Schemas, drafts, AI specs, styles, fonts, xAPI) imports no React and works on a server; `/player` holds the players, marked `'use client'` for React Server Components. lk-react, `react` and `react-dom` are now optional peers.
  - **Contracts.** Every validation issue has a stable `code`. Unknown keys are kept, in a copy detached from the input. Unsafe media URLs and invalid language tags are refused. JSON Schemas describe every field. `validateInteractiveActivity` is typed. `TemplateDefinition` gains `createDraft`, and `registerTemplatePlayer` renders a template of your own.
  - **Drafts and redaction.** New drafts come back `incomplete` from lk-core's `validateDraft` (and `createDraft` works through lk-core). `mediaSlots` lists every file, filled or not, and accepts partial drafts. `assertRedacted` now works on learner copies.
  - **Grading.** Neither template is graded: lk-core's `evaluate()` reports both as `deferred`. A multi-scene Cine-Scramble could previously pass on one scene.
  - **xAPI.** Only the whole activity is `completed`; a new `activity.completed` event ends a Cine-Scramble activity, and `supports.shown` / `supports.hidden` are both `interacted`.
  - **What Happens.**
    - A clip that ends before its freeze point now freezes.
    - Clips can carry WebVTT `captions`.
    - The spoken answer prefers an on-device voice and reports its own errors.
    - The player stops only speech it started, and N moves on from a clip with no sample answer.
  - **Cine-Scramble.**
    - "Pause clips" stops every loop, and autoplay-blocked loops wait behind it.
    - Drags are single-pointer and never get stuck, and a clip no longer blinks after its flight.
    - Focus stays in the board after a click, and five or six clips complete three to a row.
  - **Layout and accessibility.**
    - Below a minimum scale the player stacks, so text stays readable and zoom works.
    - The player fits inside a container's padding instead of overflowing it, and on a phone the step heading stays a small single line.
    - Each step focuses its heading without taking focus from the host page, and one status region carries the announcements.
    - Resize messages report only measured sizes and can size an iframe.
    - A `shortcuts` option turns single-key shortcuts off.
    - The chrome is marked with the language it is written in.
    - Every dashed edge and secondary text now meets WCAG contrast.
  - **Fonts.** `parseGoogleFontsCss` reads Google's stylesheet into the exact files to bundle, and `localFontFaceCss` keeps each face's unicode range.
  - **Copy.** English and Spanish chrome reviewed for learners, for example "Watch again" and "Take out of the slot".

  Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-interactive-activities/README.md

## 0.1.0

### Minor Changes

- [#184](https://github.com/intellectif/learning-kit/pull/184) [`cfdc4a4`](https://github.com/intellectif/learning-kit/commit/cfdc4a49b0767a2d3af3ae3a49907dfd3fb5ca1c) Thanks [@diego28e](https://github.com/diego28e)! - **New package: lk-interactive-activities** — React 19 players and contracts for What Happens and Cine-Scramble, hosted video activities with zero runtime dependencies.

  **Action required:** none. This is the first published version; nothing else changes. Install it beside its peers: `@intellectif/lk-core` 1.x (1.15 or later), `@intellectif/lk-react` 23.x, `react` and `react-dom` 19.

  - **Players:** `InteractiveActivityPlayer`, or `WhatHappensPlayer` and `CineScramblePlayer` directly.
    - What Happens: watch to a frame-accurate freeze point, predict, reveal, tell, compare with a sample answer, listen. The optional supports stay hidden until the teacher opens them ("To help you" or H), with an animated reveal. "All clips" or Escape goes back from any step.
    - Cine-Scramble: order a scene's clips by dragging, by tapping a clip then a slot, or with the keyboard, then check. A dragged clip lifts, follows the pointer and leans into its movement, the board shows where it can land, and every move ends in a flight to its place. Every learner starts from the same order, which never gives the answer away and is not in the page.
    - Host options: asset URLs (`resolveUrl`), typed events (`onEvent`), the chrome's language (`locale`, English by default and Spanish built in, independent of the content's language), chrome copy (`strings`, below the editor's own `copy`), reduced motion, the space to fit (`viewport`, by default the container's width), and iframe resize messages with the rendered size.
  - **Contracts:** a template registry (`getTemplate`, `listTemplates`, `registerTemplate`, `registerInteractiveActivities`) and `validateInteractiveActivity` for any template. Each template has a validator, a JSON Schema, media slots and a draft factory. lk-core's `redact()` keeps the sample answer and drops the authoring fields.
  - **Styles:** two presets with light and dark tokens as `--lkia-*` CSS variables, every text colour at WCAG AA. `default` is a classroom look; `cinema-dark` is a screening room. CSS-only motion presets (`default`, `lively`, `gentle`) respect reduced motion. Fonts come from an allow-list of ten Google Fonts families, with hosted and offline-export helpers.
  - **AI authoring specs:** `template.aiSpec` (`WHAT_HAPPENS_AI_SPEC`, `CINE_SCRAMBLE_AI_SPEC`) describes the AI-fillable fields, count rules, prompt fragments, per-clip video prompts and, for What Happens, freeze-point suggestions. Plain data: the package calls no model.
  - **xAPI:** `playerEventToXapi` builds a statement per player event with lk-core's `xAPIBuilder`. Speaking is never graded and no statement carries a score; only a Cine-Scramble order check reports `success`. The package sends nothing: no network, storage or media reads.

  Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-interactive-activities/README.md
