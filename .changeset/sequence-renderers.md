---
'@intellectif/lk-react': minor
---

`ActivitySequence` gains a renderer registry and can finally run mixed sets containing a written response.

**Fixes a real defect:** a set mixing graded activities with a written response could **never complete**. The essay slot rendered a dead-end "not supported" note, so `onComplete` never fired — and any "section submitted / persist attempt / award XP" logic hanging off it silently never ran. Written responses are now dispatched to the real `<WrittenResponse>`.

**New `onFinished(items)`** — the general completion signal, reporting a `SequenceItemOutcome` per slot:

```ts
type SequenceItemOutcome =
  | { kind: 'scored';    index: number; activityId: string; result: ActivityResult }
  | { kind: 'submitted'; index: number; activityId: string; submission: WrittenResponseSubmission };
```

Two kinds, because two kinds of activity exist: those the SDK scores at submit time, and those a grader scores later. Collapsing them would mean inventing a score for ungraded work.

`onComplete` is unchanged and still promises `ActivityResult[]`, so it now fires **only when every slot was scored** — it cannot fire for a set containing a written response, because there is no honest `ActivityResult` to supply. Existing all-graded sequences behave exactly as before; use `onFinished` for mixed sets.

**New `renderers` prop — the React half of the activity-type registry.** `registerActivityType` already let a consumer define a custom type in `lk-core`; there was no way to put it on screen, so the type system was open in core and closed in React (original Requirement 15.4–15.6). Now:

```tsx
<ActivitySequence activities={items} renderers={{ matching: MatchingItem }} />
```

Renderers are keyed by `data.type` and receive the standard `ActivityProps`. A key matching a built-in **overrides** it, so a consumer can replace the bundled multiple-choice renderer without forking the sequencer. An unknown type with no registered renderer still degrades to an accessible note rather than crashing.

**New `renderMode` prop** on the sequence, forwarded to every child, so a whole set can be rendered in `exam` or `review` mode in one place.
