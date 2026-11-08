---
'@intellectif/lk-interactive-activities': minor
---

**Interactive activities 0.2: a server-safe contracts entry, players under `/player`, and the fixes of a full audit.**

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
