---
'@intellectif/lk-core': minor
---

A dictation's captions are refused whatever form they take: `tracks` count as captions, as
`captionsUrl` always did.

**This tightens validation.** A dictation whose `media` or `slowMedia` carries a non-empty `tracks`
list, and a group whose stimulus carries one while a dictation without its own recording plays that
stimulus, were valid until now — and were not safe. A caption track transcribes the words a dictation
asks the learner to type; a subtitle track translates them, which gives them away just as surely.
Redaction keeps tracks, because on any other recording they are what a learner is meant to see, so
before this release such a track reached an exam client.

`validateActivity`, `validateItemGroup`, `assertRedacted`, `assertRedactedItemGroup`, `redact()` and
`redactItemGroup()` now refuse it with the message they give for `captionsUrl`, at `media.tracks`,
`slowMedia.tracks` or `stimulus.media.tracks`; `validateDraft` and `validateItemGroupDraft` report
`dc_captions_not_allowed` there. With both `captionsUrl` and `tracks` on a group's stimulus, the one
refusal stays at `stimulus.media.captionsUrl`, where it has always been. Check stored content before
upgrading: remove the tracks, or give the dictation a recording of its own without them.

Also:

- `ThemeTokens` gains four optional tokens for the interactive video's caption lines:
  `--lk-iv-caption-color`, `--lk-iv-caption-secondary-color`, `--lk-iv-caption-secondary-scale` and
  `--lk-iv-caption-gap`.
- The `video-captions-changed` interaction is documented with its new payload: `srclang` for the
  first caption line and `secondary` for the second, each `null` when none shows.
