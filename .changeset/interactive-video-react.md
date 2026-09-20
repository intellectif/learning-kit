---
'@intellectif/lk-react': major
---

`<InteractiveVideo>`: a video that stops at each quiz, asks its questions over itself and carries on.

New subpath `@intellectif/lk-react/components/InteractiveVideo`, about 34 kB brotli including all
five embeddable question types. The player owns the whole surface: a progress bar that marks every
quiz and previews the caption under the pointer, speed, volume, captions parsed from WebVTT (with a
`captionsLoader` for a file that needs the learner's credentials), a settings menu, a contents and
transcript panel, picture-in-picture, fullscreen and a keyboard map with a shortcut sheet.

A quiz covers the video and grows the player rather than scrolling inside itself; every question of
an opened quiz stays mounted, so rewinding loses no answer; the controls are `inert` while it is
open and the shortcuts pause, so typing an answer can never scrub the video. A **required** quiz
holds playback, seeking and resuming until it is answered. Answers report with the slot the question
sits in and the quiz it belongs to, and `onProgress` gives a resume point that is never past an
unanswered required quiz.

48 new strings (all in `docs/i18n.md`), the `.lk-iv-*` skin hooks, and one optional theme token,
`--lk-color-media-accent`, which the always-dark player chrome draws its accent from.

**Major** because the peer range moves to `@intellectif/lk-core@^0.15.0`. Nothing was removed: a
hand-built `LkStrings` object needs the new `video*` keys, and everything else is an addition.

See `docs/interactive-video.md` and the 0.14 → 0.15 section of `docs/upgrading.md`.
