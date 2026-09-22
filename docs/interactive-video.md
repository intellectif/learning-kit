# Interactive video

An interactive video is a video that **stops at the moments an author chose and asks the learner
questions**, then carries on. It is not a new activity type: it is an ordinary **item group** whose
stimulus is a video and which carries a `timeline` — so every question inside it stays its own
question, with its own slot id, its own response and its own grade.

It describes `@intellectif/lk-core` 0.16.0 and `@intellectif/lk-react` 16.1.0.

- [The model](#the-model)
- [Authoring one](#authoring-one)
- [What can be embedded](#what-can-be-embedded)
- [Rendering it](#rendering-it)
- [Captions and the transcript](#captions-and-the-transcript)
- [Resume](#resume)
- [Answers, grades and the score](#answers-grades-and-the-score)
- [Navigation and required quizzes](#navigation-and-required-quizzes)
- [Modes](#modes)
- [Rendering questions yourself](#rendering-questions-yourself)
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
- a dictation inside a video carries its **own** recording: the video's audio is not its stimulus —
  and that recording carries no captions, neither a `captionsUrl` nor `tracks`: a transcription or a
  translation of the words it dictates is the answer;
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
  recordingBinding={binding}          // required for a read-aloud the SDK draws
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

### Tracks

Give each language its own entry in `media.tracks`:

```jsonc
"tracks": [
  { "kind": "captions",  "src": "/api/lessons/2/captions/en.vtt", "srclang": "en", "label": "English", "default": true },
  { "kind": "subtitles", "src": "/api/lessons/2/captions/es.vtt", "srclang": "es", "label": "Español" },
  { "kind": "subtitles", "src": "/api/lessons/2/captions/ar.vtt", "srclang": "ar", "label": "العربية" }
]
```

- **`captions`** transcribe the audio, in its own language; **`subtitles`** translate it. Where two
  tracks share a language, the player prefers the `captions` one.
- **Label each track in its own language** — `Español`, `العربية`, not "Spanish", "Arabic" — so a
  learner finds their language whatever the interface is in. The player shows labels as given.
- **Where the file lives:** a public file needs nothing more; the player fetches `src` with
  `same-origin` credentials. For an endpoint that needs the learner's credentials, pass
  `captionsLoader`, which receives the track and returns the WebVTT text. A `<track src>` is a plain
  subresource fetch and carries no `Authorization` header — the reason the prop exists.
- `media.captionsUrl` from earlier versions still works, read as one track in the player's `locale`
  (English when none is set). It can never be half of a pair: a pair needs two tracks.

A file that cannot be read never breaks the video. The settings menu says which language failed,
and a second language that fails never takes the first one with it.

### Two languages at once

A learner can show **a second language under the first** — the language they are learning, and
their own, one line each, so they can match what they hear to what it means. It is a learner's
preference, never content: nothing about it is authored, and a track carries no "secondary" flag.

- **Settings → Captions** picks the first line, as it always has. With tracks in two or more
  languages, **Second language** picks the line under it — any language but the first line's own.
  The menu row reads `English + Español`.
- Picking, as the first line, the language the second line shows **swaps** them rather than dropping
  one.
- **C** turns captions off and on — both lines, keeping both choices. **Shift + C** turns the second
  line on and off; on, it brings back the last language the learner had, else the host's suggested
  one, else the first other language the video has.
- Each line shows **its own** cue: a translation segmented differently from the audio still reads
  line for line, and a line with nothing to say at a moment is simply not drawn.
- The **transcript** shows the second language under each row — each second-language line under
  the row it overlaps most — and its search finds words in either language. The preview on the
  progress bar stays first-language only, to keep it small.
- The player chooses a second line **only when the learner asked for one**: a language the video
  lacks is no second line at all, never a stand-in. `resolveCaptionTracks(tracks, preferences)`
  applies exactly the rules the player does, for a host that wants to state them in its own UI.

### Whose choice wins: `preferences` and `defaultPreferences`

Each preference is decided on its own, highest first:

| Layer | Prop | Meaning |
|---|---|---|
| 1 | `preferences` | **Forces** the field: overrides what the learner chose, every time a video opens |
| 2 | — | What the learner chose in this browser |
| 3 | `defaultPreferences` | **Suggests** the field: applies until the learner chooses otherwise |
| 4 | — | The SDK's defaults (captions on, the default track, no second line) |

So a host that wants beginners to see English with their own language under it passes
`defaultPreferences={{ captionLanguage: 'en', secondaryCaptionLanguage: learner.nativeLanguage }}`
— and a learner who turns the second line off keeps it off. Use `preferences` only for what the
learner must not change.

The player stores only what the learner chose, never what a host forced or suggested, so a host
that later suggests a different pair still reaches a learner who never picked one.

**Keeping the choice on the learner's account.** `onPreferencesChange(next, change)` fires after
every change the learner makes — never when a video opens. Save `next` (or just `change`) to the
account and pass it back as `defaultPreferences`: on a new device nothing is stored, so the account's
choice applies; on the same device the stored choice is that same choice. `defaultPreferences` is
read live, so a value that arrives after the video opens still fills every field nobody chose.

Each change is also reported as a `video-captions-changed` interaction whose payload is the
languages on screen: `{ srclang, secondary }`, each a track's `srclang` or `null`.

### Drawing

```html
<div class="lk-iv-captions" data-size="medium" data-background>
  <div class="lk-iv-caption" data-role="primary"   data-size="medium" data-background lang="en" dir="auto"><span>…</span></div>
  <div class="lk-iv-caption" data-role="secondary" data-size="medium" data-background lang="es" dir="auto"><span>…</span></div>
</div>
```

The container sits over the video and rises with the controls; each line keeps the
`.lk-iv-caption` class, its `span`, and `data-size` / `data-background`, so a stylesheet written
against 15.x still matches the lines. Every line — and every transcript row and menu item showing a
track's text — carries `dir="auto"`, so an Arabic line's punctuation lands on the right side.

Four tokens style the lines:

| Token | Default | |
|---|---|---|
| `--lk-iv-caption-color` | `#ffffff` | The first line |
| `--lk-iv-caption-secondary-color` | `#ffe066` | The second line. Must clear 4.5:1 on the caption box |
| `--lk-iv-caption-secondary-scale` | `0.85` | The second line's size, as a share of the first |
| `--lk-iv-caption-gap` | `0.25em` | The space between the lines |

The second line differs from the first by position and size as well as colour — colour alone would
fail WCAG 1.4.1 — so keep the scale below 1 if you restyle it. In the transcript the second language
takes the theme's muted text colour instead: the caption colour is chosen for the dark caption box,
and on the light panel it would not be readable.

Captions are drawn by the player, so a native picture-in-picture window shows none; that is a limit
of the browser's window, which holds only the video.

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

## Rendering questions yourself

`renderQuestion` hands a question to you to draw — each question once its quiz has opened, and
again on every render after. Use it when you have a renderer of your own that
**behaves** differently — a read-aloud that assesses the moment a take is recorded, stops on its own
after silence, or restores a take stored earlier. To make the SDK's questions merely *look* like
yours, you do not need it: use the skin tokens and class hooks in [styling.md](./styling.md).

Return `undefined` for the SDK's own component, so you can take over one type and leave the rest.
`null` draws nothing, and is kept — it is never a fallback.

```tsx
import {
  InteractiveVideo,
  type InteractiveVideoQuestion,
} from '@intellectif/lk-react/components/InteractiveVideo';

<InteractiveVideo
  group={video}
  renderMode="practice"
  renderQuestion={(question) =>
    question.activity.type === 'read-aloud' ? <MyReadAloud question={question} /> : undefined
  }
  onSubmit={(response, slot) => save(slot.slotId, response)}
  onActivityComplete={(result, slot) => record(slot.slotId, result)}
  onFinished={(summary) => finish(summary)}
/>
```

The video still owns everything around the question: when it opens, whether it counts as answered,
whether a required quiz lets the learner go on, pausing, resume, and the end card and summary. **It
never treats a question you draw differently from one it draws**: the step dots, the Continue gate
of a required quiz, the end card's count and score and `onFinished`'s statuses read the same state.

What you draw is keyed by the question's slot and **stays mounted for the life of the player**, as the
SDK's own questions do — a rewind loses nothing. It sits inside the same error boundary: a throw,
while rendering or inside `renderQuestion` itself, replaces that one question with the fallback and
never stops the video.

### What a question is handed

| Field | What it is |
|---|---|
| `activity` | The question as the SDK would have rendered it: full data, or a `redact()` projection |
| `slot` | `{ slotId, index, activityId, cueId }` — the same object `onSubmit` is handed, for the life of the player |
| `renderMode` | Passed through untouched; see the rules below |
| `active` | `true` while this question is on screen; see [the microphone rule](#the-microphone-rule) |
| `locale` | The player's `locale`, when you gave one |
| `defaultValue` | The answer restored from `responses`: a starting value, read once |
| `defaultSubmitted` | Whether `submittedSlotIds` names it: handed in before the attempt resumed |
| `outcome` | Its stored outcome from `outcomes`: review, or a grade that arrived later. Read live |
| `portalContainer` | Where to portal popovers; see [Popovers and fullscreen](#popovers-and-fullscreen) |

And the calls through which the video learns what the learner did — the same calls the SDK's own
components make:

| Call | What the video does | What it forwards |
|---|---|---|
| `submit(response)` | Marks the question answered | `onSubmit(response, slot)` |
| `complete(result)` | Marks it answered; keeps `score / maxScore` for the end card when `maxScore > 0` | `onActivityComplete(result, slot)` |
| `clear()` | Unanswered again, its score forgotten: the dot empties, a required quiz holds again, `onFinished` would say `skipped` | Nothing — you already know |
| `setPending(on)` | While any question is pending, Finish waits | Nothing |
| `emit(type, payload?)` | — | `onInteraction`, with this question's `activityId` and the time |

- **Latest wins.** Call `submit` or `complete` again for a second take or a corrected answer; the
  score on the end card is the latest one, and a result with nothing to score (`maxScore: 0`) leaves
  it with none.
- **Either on its own is an answer.** A type graded later calls `submit` alone; a host that grades
  in the browser may call only `complete`. Nothing you did not call is forwarded — `complete` does
  not invent an `onSubmit`.
- **One identity each, for the life of the player**, so they are safe in an effect's dependencies.
  Called after the player has unmounted, each does nothing.
- **In `review`, `submit`, `complete` and `clear` are ignored**, with one development warning per
  call. The SDK cannot keep a mode for pixels it does not draw: in `exam`, reveal no correctness; in
  `review`, accept no answer.

### The microphone rule

`active` is `false` from the moment the question leaves the screen — the learner pages to another
question, the quiz closes (Continue, Skip, Rewatch), another quiz opens — and `true` again when they
come back. **When it turns `false`, stop your microphone, your timers and anything speaking.** The
video pauses the `<audio>` and `<video>` elements inside the question and stops the recorders the SDK
started; it cannot reach one it did not create.

A video error while a quiz is open does not turn it `false`: the quiz stays on top of the error, and
the question on it is still the learner's to answer.

### Finish waits for an answer on its way

`setPending(true)` says work is on its way for the question — an upload, an assessment. While any
question is pending:

- **Finish** on the end card is `aria-disabled`, described by a status line (`videoAnswerPending`,
  "Saving your answer…"), and pressing it says so instead of finishing.
- A video that **ends** with every question answered finishes once nothing is pending, not before.
- Closing the quiz, paging, skipping and seeking do not wait: the question stays mounted, so the
  work completes and reports late, which is what you want.

Call `setPending(false)` however the work ends, a failure included. A question you stop drawing —
or one that throws — is released for you, so a pending nobody can clear never holds Finish for good.

The SDK's own read-aloud does the same for its takes: a take being stored or judged holds Finish,
where before 16.1.0 Finish reported that question skipped and its answer arrived after the summary.

### Popovers and fullscreen

In fullscreen only the player is painted, so a tooltip portalled into `document.body` silently
vanishes. Portal into `portalContainer` instead: one element for the whole player, inside it, drawn
above the quiz, the same element for the life of the player — key what you put in it. It is `null`
only before the player's first commit.

```tsx
createPortal(<MyTooltip key={question.slot.slotId} />, question.portalContainer ?? document.body);
```

Escape on an open quiz skips it. React carries a keydown up through a portal to the quiz, so a
popover of yours that closes on Escape should call `event.preventDefault()`: the quiz leaves a
prevented Escape alone.

### A read-aloud of your own, end to end

```tsx
function MyReadAloud({ question }: { question: InteractiveVideoQuestion }) {
  const { active, setPending, submit, complete, portalContainer } = question;
  const recorder = useMyRecorder(); // your microphone, your silence detection

  // THE MICROPHONE STOPS WHEN THE QUESTION LEAVES THE SCREEN.
  useEffect(() => {
    if (!active) {
      recorder.stop();
    }
  }, [active, recorder]);

  const onTake = async (take: Blob) => {
    setPending(true); // Finish waits from here…
    try {
      const key = await myApi.upload(take); // your storage
      submit({ type: 'read-aloud', recording: { key, mimeType: take.type } });
      complete(await myApi.assess(key)); // your grade, as an ActivityResult
    } finally {
      setPending(false); // …to here, however it ends
    }
  };

  return <MyRecorder recorder={recorder} onTake={onTake} tooltipContainer={portalContainer} />;
}
```

A video whose read-alouds are all drawn this way needs no `recordingBinding`: the binding is
required only for a read-aloud the SDK draws itself.

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
