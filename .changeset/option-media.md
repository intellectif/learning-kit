---
'@intellectif/lk-core': minor
'@intellectif/lk-react': major
---

Multiple-choice options can carry a picture or a recording.

The A1/A2 picture-choice item ("which picture shows a cat?") and the minimal-pair listening item had no expression in the data contract: `media` sat above the question, one asset per activity, so four pictures as four options was not sayable.

`MultipleChoiceOption.media` adds it, additively — `text` stays required on every option, because it names the option in the accessible name and in the xAPI statement and is what the learner sees when a picture fails to load.

**Only `image` and `audio` are accepted.** `video` and `embed` are refused by the schema, and not out of caution: both render a control surface that swallows the click meant to select the option, so the learner could not choose it. An option also carries **no `playback` policy** — `maxPlays` binds per slot through a `MediaBudgetBinding`, and nothing has decided whether four recordings in one question share a budget or hold one each, so writing one is an error rather than a promise no renderer keeps.

A picture renders **inside** the option's label, so clicking it selects the option and its `alt` joins the accessible name. A recording renders **outside** the label, so pressing play does not commit the learner to that answer before they have heard the others. An option with no media renders exactly the markup it always did.

`alt` follows the rule activity media already uses — required and non-empty for an image, optional for audio. Note that on a picture-choice item the `alt` is part of the item: it can hand a screen-reader user the answer. The SDK requires it so an option is never silently inaccessible and leaves the wording to you; the authoring guide says so plainly.

Redaction keeps option media intact — it is what the learner picks — and removes only `isCorrect` and per-option `feedback`. Draft checks report an option's media under the codes media already uses (`media_url_required`, `media_alt_required`, `media_url_invalid`), plus one new code, `mc_option_media_kind`, for a refused `video` or `embed`.
