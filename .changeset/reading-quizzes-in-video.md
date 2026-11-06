---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

**Reading quizzes in an interactive video: a quiz the reading route covers opens as a guided reading route in practice**

**Action required:** none. Install lk-core 1.12.0 with lk-react 23.9.0: lk-react calls the new lk-core function. **No grade changes:** every question in a reading quiz is recorded and scored by the video as in any quiz. Content 1.11.0 accepted is still accepted; a route in an interactive video, which 1.11.0 refused with `ig_route_with_timeline`, is now valid, and that code is no longer reported.

- **lk-core:** a group with a `timeline` may carry a `route` when the video stimulus holds the passage as its text (`stimulus.body`). A quiz whose every question the route covers is a reading quiz; `readingQuizzes(group)` lists them. The new `ig_route_quiz_mixed` refuses a quiz the route covers only part of; a route on a video with no timeline is still refused (`ig_route_stimulus_kind`).
- **lk-react:** in `practice`, `<InteractiveVideo>` opens a reading quiz as a `<ReadingRoute>` in its quiz panel, with the passage beside the quiz's questions; its new `readingRoute` prop takes the route's settings and `onFinish(result, cueId)`. Each answer is recorded under its own slot, and an answer given but not handed in is handed in when the learner finishes. In `exam` and `review`, a reading quiz is an ordinary quiz. The route is loaded only by a video that has one. See https://github.com/intellectif/learning-kit/blob/main/docs/reading-route.md#in-an-interactive-video
