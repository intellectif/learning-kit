---
'@intellectif/lk-react': minor
---

A question a host draws inside `<ActivitySequence>` gets everything one the SDK draws has, and the AI
rules are available without the SDK's buttons.

- **`renderers` overrides get a `question` prop** (`SequenceQuestion`), the pager's half of the
  contract, as `renderQuestion` gave one to `<InteractiveVideo>` in 16.1.0:
  - `active` — whether this is the question on screen. **Stop the microphone, any timer and any
    speech when it turns `false`:** the pager pauses the media inside the question and stops the
    recorders the SDK started, but cannot reach one it did not create;
  - `setPending(true/false)` — work of your own is on its way (an upload, a save, a judgement).
    `onFinished` and `onComplete` wait for it, so a set is never reported a moment before the last
    answer settles. Call it with `false` however the work ends, a failure included;
  - `portalContainer` — a node inside this question's own pane. Portal a popover into it rather than
    into `document.body`, and it is hidden when the learner pages away and painted with the question
    in fullscreen;
  - `clear()` — the learner withdrew their answer: the slot holds nothing again, and the set is
    unfinished until it is answered again;
  - `emit(type, payload?)` — an interaction, with this question's `activityId` and the time filled
    in;
  - `slot` — the identity to store the answer against, the same object `onSubmit` is handed.
- **Every call keeps one identity for the life of the set**, `onSubmit` and `onComplete` included, so
  a renderer may hold them in an effect and a host that re-renders on every keystroke does not re-run
  it.
- **New: `useAiHints` and `useAiExplanation`** (`@intellectif/lk-react/ai/useAiHelp`, also on the
  root) — AI help for a question you draw yourself: the same rules, facts, checks and records the
  bundled components use, with your own markup. `ask` does nothing where the rules say no, so a page
  drawing its own button reaches no model in an `exam`. The SDK's own components are built on these
  hooks, so there is one implementation of the rules and not two.
- **The paper decides the mode.** A question inside `<ActivitySequence>` or `<InteractiveVideo>` now
  knows the mode it is being delivered in, so the hooks refuse help on an `exam` paper even when the
  host does not pass `renderMode` to them, or passes `practice` — which a component that defaults it
  can do inside an exam. Without that, a host's own question under an `LkAiProvider` could reach a
  model on a paper of record.

`ActivityRenderer` is now `ComponentType<ActivityProps & { question?: SequenceQuestion }>`. A
renderer written as `ComponentType<ActivityProps>` still fits and simply ignores the new prop; only
assigning an `ActivityRenderer` *back* to a `ComponentType<ActivityProps>` variable needs a widened
annotation.

See `docs/ai.md` and the `renderers` documentation on `<ActivitySequence>`.
