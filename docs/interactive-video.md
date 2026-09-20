# Interactive video

An interactive video is a video that **stops at the moments an author chose and asks the learner
questions**, then carries on. It is not a new activity type: it is an ordinary **item group** whose
stimulus is a video and which carries a `timeline` — so every question inside it stays its own
question, with its own slot id, its own response and its own grade.

It describes `@intellectif/lk-core` 0.15.0 and `@intellectif/lk-react` 15.0.0.

- [The model](#the-model)
- [Authoring one](#authoring-one)
- [What can be embedded](#what-can-be-embedded)
- [Rendering it](#rendering-it)
- [Captions and the transcript](#captions-and-the-transcript)
- [Resume](#resume)
- [Answers, grades and the score](#answers-grades-and-the-score)
- [Navigation and required quizzes](#navigation-and-required-quizzes)
- [Modes](#modes)
- [Chapters](#chapters)
- [What an older build does with it](#what-an-older-build-does-with-it)
- [What the SDK does not do](#what-the-sdk-does-not-do)

## The model

```jsonc
{
  "schemaVersion": "1.0",
  "type": "item-group",
  "id": "lesson-2-video",
  "slotKey": "lesson-2.video",          // pin the entry's identity before you publish
  "title": "Spelling words",
  "stimulus": {
    "id": "lesson-2-stimulus",
    "kind": "video",
    "media": {
      "type": "video",
      "url": "https://cdn.example.com/lessons/a1/l2.mp4",
      "alt": "Lesson 2: spelling words",
      "poster": "https://cdn.example.com/lessons/a1/l2.jpg",
      "tracks": [
        { "kind": "captions", "src": "/api/lessons/2/captions.vtt", "srclang": "en",
          "label": "English", "default": true }
      ]
    }
  },
  "items": [ /* the questions, in authored order */ ],
  "timeline": {
    "navigation": "free",                // or "no-skip-ahead"
    "chapters": [
      { "at": 0, "title": "Welcome" },
      { "at": 95, "title": "At the hotel desk" }
    ],
    "cues": [
      { "id": "basics", "at": 50, "title": "Spelling basics",
        "itemIds": ["q-spell-means", "q-alphabet", "q-vowels"] },
      { "id": "letters", "at": 120, "title": "Letter by letter",
        "itemIds": ["q-tokyo", "q-smith"], "required": true },
      { "id": "speak", "at": 240, "title": "Say it", "itemIds": ["q-say-rossi"] }
    ]
  }
}
```

A **cue is a quiz**: a moment, and the questions asked there. One quiz can hold several questions —
a multiple-choice quiz of three at 0:50, a fill-in-the-blanks quiz of two at 2:00, a read-aloud at
4:00 — and the player shows them one at a time with a step indicator.

The rules the schema enforces:

- the stimulus is a **video**, and the group does not shuffle (`shuffle` must be absent or `none`);
- every quiz has an `id` unique in the timeline and a finite `at` in seconds, at or after 0;
- every quiz holds at least one `itemIds` entry, each naming an item **of this group**;
- **every item is placed in exactly one quiz** — an item that no quiz asks would never be seen;
- each embedded item's type is one the player can show (see below);
- a dictation inside a video carries its **own** recording: the video's audio is not its stimulus;
- chapters are in ascending order by `at`, each with a title;
- at most 100 quizzes, 200 placed items and 100 chapters, and titles of at most 120 characters.

Quizzes are presented **in time order**, whatever order the array is in, and the questions of one
quiz in the order its `itemIds` lists them. Slot ids stay the authored ones (`flattenSequence`
numbers items by their position in `items`), so reordering a timeline never re-maps a stored grade.

## Authoring one

```ts
import { createInteractiveVideoDraft, validateItemGroupDraft } from '@intellectif/lk-core/authoring';

const draft = createInteractiveVideoDraft({ newId: () => crypto.randomUUID() });
// → an item group with a video stimulus, no file yet, no questions and no quizzes.

const result = validateItemGroupDraft(draft);
result.status;  // 'incomplete' until there is a file, a question and a quiz holding it
result.issues;  // every problem, by path and code
```

The timeline's own codes, which [docs/authoring.md](./authoring.md) lists in full:
`ig_timeline_stimulus_kind`, `ig_timeline_shuffle`, `ig_timeline_quiz_id_required`,
`ig_timeline_quiz_id_duplicate`, `ig_timeline_quiz_time_required`, `ig_timeline_quiz_time_invalid`,
`ig_timeline_quiz_empty`, `ig_timeline_quiz_unknown_item`, `ig_timeline_item_duplicate`,
`ig_timeline_item_unplaced`, `ig_timeline_item_type`, `ig_timeline_dictation_media`,
`ig_timeline_chapter_order`, `ig_timeline_chapter_title`.

An editor UI should let an author place a quiz **at the playhead**: the moment is the only field a
timeline needs that a form cannot infer.

## What can be embedded

Five types, and `INTERACTIVE_VIDEO_ITEM_TYPES` is the list the schema and the player both read:

| Type | Inside a video |
|---|---|
| `multiple-choice` | Yes |
| `fill-in-the-blanks` | Yes |
| `gap-select` | Yes |
| `dictation` | Yes, with its own recording |
| `read-aloud` | Yes, with a `recordingBinding` |

Anything else — a written response, another interactive video — is refused by the schema, with
`ig_timeline_item_type` naming the item. The list is deliberately short: these are the types that
are answered in a few seconds without leaving the video.

## Rendering it

```tsx
import { InteractiveVideo } from '@intellectif/lk-react/components/InteractiveVideo';

<InteractiveVideo
  group={video}                       // the item group above, redacted outside `practice`
  renderMode="practice"
  label="A1 · L2"
  progress={stored}                   // where the learner left off
  onProgress={(progress) => save(progress)}
  responses={attempt.responses}       // restored answers, read at mount
  submittedSlotIds={attempt.submittedSlotIds}
  outcomes={attempt.outcomes}          // read live: grades that arrive later
  captionsLoader={(track) => api.captions(track.src)}
  recordingBinding={binding}          // required when a read-aloud is embedded
  onSubmit={(response, slot) => save(slot.slotId, response)}
  onActivityComplete={(result, slot) => record(slot.slotId, result)}
  onFinished={(summary) => finish(summary)}
  onInteraction={(event) => analytics(event)}
/>
```

`slot` is the question's place: `{ slotId, index, activityId, cueId }` — the same slot id
`flattenSequence` gives it, plus the quiz it sits in. Store answers by `slotId`, never by
`activityId`: one activity may appear in more than one video.

The player is one component, and it owns the whole surface: the progress bar with a quiz marker per
quiz, a caption preview under the pointer, speed, volume, captions, a settings menu, picture in
picture, fullscreen, a keyboard map with a shortcut sheet (`?`), a contents and transcript panel,
and the quiz panel that covers the video when a quiz opens. It ships as its own subpath and weighs
about 34 kB brotli **including all five question types**.

**What the host still owns:** the video file and its hosting, the caption endpoint, storage for
answers, grades and the resume point, and — for a read-aloud — the `recordingBinding` that stores
and judges a take. The SDK never uploads, transcodes, stores or judges anything.

## Captions and the transcript

The player parses WebVTT itself rather than handing it to a `<track>`, because the caption preview
on the progress bar, the transcript and its search need the cues as data.

- **A public caption file**: list it in `media.tracks` and the player fetches it (`same-origin`
  credentials).
- **An authenticated endpoint**: pass `captionsLoader`, which receives the track and returns the
  WebVTT text. A `<track src>` is a plain subresource fetch and carries no `Authorization` header —
  this is the reason the prop exists.

A file that cannot be read never breaks the video: the captions button disappears, and the settings
menu says the captions could not be loaded. `media.captionsUrl` from earlier versions still works
and is read as a single English track.

## Resume

`onProgress` reports `{ progressVersion: '1.0', at, furthest }` at most every 5 s while playing, and
on pause, on a seek, when a quiz opens and at the end. Store it per learner and per group, hand it
back as `progress`, and the player starts there — clamped to the video's duration, and **never past
an unanswered required quiz**: a resume is not a way around one.

```ts
import { readMediaProgress } from '@intellectif/lk-core';

const stored = readMediaProgress(row.progress, durationSeconds); // never throws; null when unusable
```

## Answers, grades and the score

Each question reports exactly as it would inside `<ActivitySequence>`: `onSubmit` with the learner's
response, and — in `practice` — `onActivityComplete` with the grade the component computed. A
read-aloud reports a take through the `recordingBinding` you passed, and its grade arrives when your
assessor answers.

The video's share of an attempt composes like any other entry:

```ts
import { composeTimelineScore } from '@intellectif/lk-core';

const score = composeTimelineScore('lesson-2.video', attempt.items, policy);
```

`entryKey` is the group's `slotKey` (or its position in the sequence). It throws rather than
composing nothing when no item belongs to that key — a mistyped key must never read as a grade.
A question the learner never reached has no outcome; `MissingOutcomePolicy` decides whether that is
a zero or a deferral, and the SDK does not choose for you.

## Navigation and required quizzes

| `timeline.navigation` | What a learner may do |
|---|---|
| `free` (default) | Seek anywhere, except past an unanswered **required** quiz |
| `no-skip-ahead` | Rewind freely; never move past the furthest point they have watched |

A **required** quiz (`required: true`) holds the way on until every one of its questions is
answered: the seek stops on it and it opens, "Skip quiz" is not offered, and the Continue button is
`aria-disabled` — never natively disabled, so a keyboard learner can reach it and be told why. Under
`no-skip-ahead` the caption preview and the transcript stop at the furthest point reached, so the
bar cannot be used to read ahead.

A quiz the learner has been through — answered, skipped or continued — does not open itself again on
a second pass; it stays theirs to reopen from the contents list.

## Modes

| Mode | The video |
|---|---|
| `practice` | Questions grade themselves and show feedback; the end card shows the score |
| `exam` | Questions submit without grading ("Answer saved"); the end card counts answers only |
| `review` | Every quiz shows how it was marked, nothing is required, seeking is free, and there is nothing to finish |

In `exam` and `review`, pass the **redacted** projection — `redactItemGroup(group)` — exactly as you
would for a question set. The player asserts it in development.

## Chapters

`timeline.chapters` draw breaks on the progress bar, name the moment in the preview bubble and in
the slider's `aria-valuetext`, and fill the contents panel beside the quizzes. `[` and `]` step
between chapters and quizzes alike.

## What an older build does with it

A `timeline` is additive. An older `lk-core` that has never heard of one drops the field and the
group is still a valid item group: the same questions, the same slot ids, the same grades — a
testlet around a video instead of a video that stops. Nothing is lost but the stopping.

Today `<ActivitySequence>` does the same: a group with a timeline is paged as a testlet, with its
video as the shared stimulus. Render `<InteractiveVideo>` directly for the interactive experience; a
later release folds it into the pager as one step.

## What the SDK does not do

- **No provider embeds.** `media.url` is a video file the browser can play (`video/mp4`,
  `video/webm`). A YouTube or Vimeo iframe cannot be paused reliably from outside, and an
  interactive video that cannot be paused is not one.
- **No transcoding, hosting, analytics or storage.**
- **No speech recognition.** Captions come from your pipeline; a read-aloud is judged by your
  assessor (see [docs/speech-assessment.md](./speech-assessment.md)).
- **No autoplay.** The learner presses play; nothing starts with sound on its own.
