---
'@intellectif/lk-react': minor
---

**`<InteractiveVideo>` holds a spoken answer: the video pauses, the learner answers out loud, and reads the grade at the pause**

**Action required:** none. A video holding a spoken answer needs lk-core 1.10.0, which this release peers on.

- **The SDK's own card:** `<SpeakingResponse>`, with the video's `recordingBinding` bound to the question's slot (`upload`, `assess`, `playbackUrl`), `assessments[slotId]` for review, `workletUrl`, and the props every question gets. One binding serves read-aloud and spoken-answer questions, as in `<ActivitySequence>`.
- **A take on its way** holds Finish on the end card, and a required quiz holds the learner until the take is stored, as a read-aloud's take does.
- **A grade a person will give** (`assess` answers `{ status: 'pending' }`): the question counts as answered, the learner is told it waits for its grade, `onActivityComplete` is not called, and its quiz shows `pending` on the progress bar and the end card. In `practice`, a `deferred` outcome in `outcomes` shows the same for a spoken answer you draw through `renderQuestion`.
- **`exam`:** recorded and submitted, never assessed, and an answer without a recording can be handed in. **`review`:** the stored outcome, what was said, and the take played back through `playbackUrl`.
- **While the learner records,** the video stays paused with its controls and shortcuts off, the question's own recording falls silent, and closing the quiz stops the take.
- **Size:** the `InteractiveVideo` entry is about 45 kB brotli, within its 50 kB budget.
- **Why a minor:** additive. The five other question types render and report as before.
