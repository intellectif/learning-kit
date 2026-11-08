---
'@intellectif/lk-interactive-activities': minor
---

**New package: lk-interactive-activities** — React 19 players and contracts for What Happens and Cine-Scramble, hosted video activities with zero runtime dependencies.

**Action required:** none. This is the first published version; nothing else changes. Install it beside its peers: `@intellectif/lk-core` 1.x (1.15 or later), `@intellectif/lk-react` 23.x, `react` and `react-dom` 19.

- **Players:** `InteractiveActivityPlayer`, or `WhatHappensPlayer` and `CineScramblePlayer` directly.
  - What Happens: watch to a frame-accurate freeze point, predict, reveal, tell with optional supports, compare with a sample answer, listen. "All clips" or Escape goes back from any step.
  - Cine-Scramble: order a scene's clips by dragging, by tapping a clip then a slot, or with the keyboard, then check. Every learner starts from the same order, which never gives the answer away and is not in the page.
  - Host options: asset URLs (`resolveUrl`), typed events (`onEvent`), the chrome's language (`locale`, English by default and Spanish built in, independent of the content's language), chrome copy (`strings`, below the editor's own `copy`), reduced motion, the space to fit (`viewport`, by default the container's width), and iframe resize messages with the rendered size.
- **Contracts:** a template registry (`getTemplate`, `listTemplates`, `registerTemplate`, `registerInteractiveActivities`) and `validateInteractiveActivity` for any template. Each template has a validator, a JSON Schema, media slots and a draft factory. lk-core's `redact()` keeps the sample answer and drops the authoring fields.
- **Styles:** two presets with light and dark tokens as `--lkia-*` CSS variables, every text colour at WCAG AA. `default` is a classroom look; `cinema-dark` is a screening room. CSS-only motion presets (`default`, `lively`, `gentle`) respect reduced motion. Fonts come from an allow-list of ten Google Fonts families, with hosted and offline-export helpers.
- **AI authoring specs:** `template.aiSpec` (`WHAT_HAPPENS_AI_SPEC`, `CINE_SCRAMBLE_AI_SPEC`) describes the AI-fillable fields, count rules, prompt fragments, per-clip video prompts and, for What Happens, freeze-point suggestions. Plain data: the package calls no model.
- **xAPI:** `playerEventToXapi` builds a statement per player event with lk-core's `xAPIBuilder`. Speaking is never graded and no statement carries a score; only a Cine-Scramble order check reports `success`. The package sends nothing: no network, storage or media reads.

Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-interactive-activities/README.md
