---
'@intellectif/lk-interactive-activities': minor
---

**New package: lk-interactive-activities** — React 19 players and contracts for What Happens and Cine-Scramble, hosted video activities with zero runtime dependencies.

**Action required:** none. This is the first published version; nothing else changes. Install it beside its peers: `@intellectif/lk-core` 1.x, `@intellectif/lk-react` 23.x, `react` and `react-dom` 19.

- **Players:** `InteractiveActivityPlayer`, or `WhatHappensPlayer` and `CineScramblePlayer` directly. What Happens: watch to a freeze point, predict, reveal, tell, compare with a sample answer, listen. Cine-Scramble: order a scene's clips by pointer or keyboard and check. Host options for asset URLs (`resolveUrl`), typed events (`onEvent`), copy (`strings`, English and Spanish built in), reduced motion, a constrained viewport and iframe resize messages.
- **Contracts:** a template registry (`getTemplate`, `listTemplates`, `registerTemplate`, `registerInteractiveActivities`), validators, JSON Schemas, media slots and draft factories for both templates.
- **Styles:** style presets (`default`, `cinema-dark`) with light and dark tokens as `--lkia-*` CSS variables, CSS-only motion presets (`default`, `lively`, `gentle`) that respect reduced motion, and an allow-listed font catalog with hosted and offline-export helpers.
- **AI authoring specs:** `template.aiSpec` (`WHAT_HAPPENS_AI_SPEC`, `CINE_SCRAMBLE_AI_SPEC`) describes the AI-fillable fields, count rules, prompt fragments, per-clip video prompts and, for What Happens, freeze-point suggestions. Plain data: the package calls no model.
- **xAPI:** `playerEventToXapi` builds a statement per player event with lk-core's `xAPIBuilder`. Speaking is never graded and no statement carries a score; only a Cine-Scramble order check reports `success`. The package sends nothing: no network, storage or media reads.

Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-interactive-activities/README.md
