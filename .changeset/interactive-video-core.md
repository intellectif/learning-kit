---
'@intellectif/lk-core': minor
---

Interactive video: an item group whose stimulus is a video can now carry a `timeline` — quizzes at
moments of the video, each holding one or more of the group's own questions.

Additive throughout. `MediaTimeline`, `TimelineCue`, `TimelineChapter`, `MediaProgress` and
`MediaTrack` are new types; `ItemGroup.timeline`, `ActivityMedia.tracks` and `ActivityMedia.poster`
are new optional fields; `SequenceSlot.group` now carries the `cue` a question sits in, and
`AttemptPlanDrift` reports a moved quiz as `changedCueSlotIds`.

The schema places every question in exactly one quiz, keeps quiz ids unique, orders chapters, allows
only the five types a video can ask (multiple choice, fill-in-the-blanks, gap select, dictation,
read-aloud) and refuses a dictation with no recording of its own. `INTERACTIVE_VIDEO_ITEM_TYPES` and
`isInteractiveVideoItemType` are that list as data. `readMediaProgress` reads a stored resume point
without trusting it, `composeTimelineScore` folds a video's questions into an attempt's score, and
`createInteractiveVideoDraft` plus the `ig_timeline_*` authoring codes cover the editor.

Redaction carries the timeline, the poster and the caption tracks through: they are learner-visible
by definition. Nothing changed shape, so an older build that has never heard of a timeline drops it
and renders the same testlet with the same slots and the same grades.

See `docs/interactive-video.md`.
