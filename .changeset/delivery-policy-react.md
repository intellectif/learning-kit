---
'@intellectif/lk-react': major
---

Every activity, `<ActivitySequence>` and `<InteractiveVideo>` take a `delivery` policy: what the school
running a paper lets a learner see. Each setting only takes away from what `renderMode` shows, and an
absent or empty policy takes nothing — every test that existed before passes unchanged.

- **`feedback: false`** — no marks, no score, no authored feedback; the learner sees "Answer
  submitted." and `onComplete` still receives the grade. In `review` a grade is not read back, while
  "Not graded yet" still is. A read-aloud shows no grade or marks after a take, a written response
  no returned grade, and the video's end card counts answers instead of scoring them.
- **`solutions: false`** — the right answer is never shown beside a wrong one: multiple choice marks
  only the options the learner chose (and hides feedback written on the ones they did not),
  `showCorrectAnswers` writes nothing into a blank, a dictation offers no "Show solution".
- **`hints: false`** — no hints of any kind: the author's fill-in-the-blanks hints, a dictation's
  word hints, and AI hints. The author's hints stay **on in `exam` by default, as they always were**:
  an authored hint is part of the item and the same for every learner, so a paper of record may offer
  it. A paper whose hints are help rather than part of the question switches them off.
- **`ai: { hints?, explanations? }`** — the deployment's switches for AI help, beside the author's on
  the item and the host's ports. "Explain my answer" also needs `feedback` and `solutions`: it explains
  a grade, and all but always names the right answer.
- **The paper decides.** A pager publishes its policy to every question it holds, which combines it
  with its own, whichever is stricter. A `renderers` override is handed it as `delivery`, a video's
  `renderQuestion` as `question.delivery` spelled out, and `useAiHints` / `useAiExplanation` take a
  `delivery` input and read the paper's themselves — so a host's question that ignores what it was
  handed still offers no AI help the paper forbids.
- **An unreadable policy restricts**, never allows, and a development build warns once.

**Major** because the peer range moves to `@intellectif/lk-core@^0.20.0`. `InteractiveVideoQuestion`
gains a required `delivery` field — a host constructing one by hand, in a test say, needs to add it.

See `docs/delivery.md`.
