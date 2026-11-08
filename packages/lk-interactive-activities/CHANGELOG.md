# @intellectif/lk-interactive-activities

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

## 0.0.0

- M6 pure AI generation guides on both templates: writable-field JSON Schemas, count/default rules, catalog metadata, per-slot video prompts and What Happens freeze-suggestion bounds. Local typed event-to-xAPI mapping via lk-core; no speech score/success, network delivery or XP.

- M5 React players: What Happens freeze/reveal/speaking/listen flow; Cine-Scramble native pointer and keyboard arranging, feedback, vocabulary and reflow; responsive scaled stage, host URL/event hooks and BBB iframe coverage.

- Style presets (`default`, `cinema-dark`) with light/dark token bundles, CSS variable mapping, CSS-only motion (`default`, `lively`, `gentle`), and Google Fonts CDN/export helpers.
- Template registry and What Happens / Cine-Scramble schemas, validators, JSON Schema, and English/Spanish chrome.
- Initial package scaffold.
