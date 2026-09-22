---
'@intellectif/lk-react': minor
---

`<InteractiveVideo>` lets a host draw its questions itself: **`renderQuestion(question)`**, called
for each question once its quiz has opened, and on every render after. Return `undefined` to keep
the SDK's own component for that one, so a host can
take over a single activity type — a read-aloud of its own that assesses as soon as a take is
recorded, say — and leave the rest; `null` draws nothing and is kept.

The video still owns everything around the question, and never treats a question the host draws
differently from its own: the step dots, a required quiz's Continue, the end card's count and score,
`onFinished`'s statuses and the resume point all read the same state. The question is handed:

- what to draw: `activity`, `slot` (the same object `onSubmit` gets), `renderMode`, `locale`, and
  what the attempt restored — `defaultValue`, `defaultSubmitted`, `outcome`;
- **`active`**, `false` from the moment the question leaves the screen and `true` when the learner
  comes back. The video stops only the recorders the SDK created: a host must stop its own
  microphone when `active` turns `false`;
- **`portalContainer`**, one element inside the player for popovers, painted above the quiz and in
  fullscreen, where anything portalled into `document.body` vanishes;
- six calls with one identity each for the life of the player, which do nothing once it has
  unmounted: `submit` and `complete` (latest wins; either alone is an answer, and nothing the host
  did not call is forwarded), `clear` (unanswered again), `setPending` and `emit`. In `review`,
  `submit`, `complete` and `clear` are ignored, with a development warning.

What the host returns stays mounted for the life of the player, keyed by slot, inside the same error
boundary as the SDK's questions: a throw — in the tree or in `renderQuestion` itself — degrades that
one question, never the video. `recordingBinding` is now required only for a read-aloud the SDK
draws itself. `InteractiveVideoQuestion` is exported from the subpath and the root.

**One behaviour change, for every host: Finish waits for an answer on its way.** While a question
is pending — `setPending(true)`, or the SDK's own read-aloud storing or judging a take — Finish on
the end card is `aria-disabled` with a status line, and pressing it says why; a video that ends with
every answer in finishes once nothing is pending. Before, Finish reported a read-aloud whose take was
still uploading as `skipped`, and its answer reached `onSubmit` after the summary. Closing the quiz,
paging and seeking do not wait. One new string, `videoAnswerPending` ("Saving your answer…").

The end card's score also follows a question's latest grade now: one that arrives while the card is
on screen shows at once, and a result with nothing to score removes the question's score instead of
leaving the earlier one.

See "Rendering questions yourself" in `docs/interactive-video.md`.
