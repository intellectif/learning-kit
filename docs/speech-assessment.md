# Speech assessment: `read-aloud`

`read-aloud` is an activity where the learner reads a text aloud. A pronunciation-assessment engine judges the recording, and the SDK turns that judgement into a grade. This guide covers:

- the data;
- the evidence an assessor must produce;
- how a grade is computed;
- what the application owns;
- how lk-react records a take, hands it to your storage and renders the marks;
- how to fill the evidence from Azure pronunciation assessment (appendix).

It describes `@intellectif/lk-core` 0.14.0 and `@intellectif/lk-react` 14.0.0, the versions the changesets for this work produce. lk-core holds the grading half: the type, the evidence shape, `inspectWav`, `validateSpeechAssessment`, `alignReadAloud` and `gradeReadAloud`. lk-react holds the browser half: `useSpeechRecorder` captures a take as the WAV `inspectWav` measures, `<ReadAloud>` records one and hands it to your storage, and `<PronunciationFeedback>` renders the marks — see [In the browser](#in-the-browser-lk-react). Neither package calls a speech service, holds a key or keeps audio.

## What the SDK does, and what your application does

The SDK never records audio on a server, stores it, calls a speech service or a model, holds a key, or schedules grading. It defines the shapes and does the arithmetic that decides a grade, so the same inputs always give the same grade.

| The SDK (lk-core 0.14.0, lk-react 14.0.0) | Your application |
|---|---|
| The `read-aloud` type: schema, drafts, redaction, xAPI definition | Storage for recordings (upload, access control, retention, deletion) |
| `inspectWav`: measures a WAV's duration and voiced time without decoding libraries | The assessor adapter: calls a pronunciation-assessment service or a model, and holds its keys and prompts |
| `validateSpeechAssessment`: checks an assessor's output before it can become a grade | Deciding **where** and **when** assessment runs (on your server for anything that counts) |
| `gradeReadAloud`: a deterministic grade from validated evidence and a server measurement | Every threshold: plausibility policy, silence level, rounding, pass lines, bands |
| `alignReadAloud`: the per-word marks a review screen shows | Persisting the raw provider response, the evidence, the grade and their provenance |
| `outcomeFromGrade` and `outcomeFromUnscorable`: both results, stored the same way | Routing unscorable results to a re-record or a human |
| `useSpeechRecorder`, `<ReadAloud>` and `<PronunciationFeedback>`: capturing the take in the browser and rendering the marks | The `recordingBinding` those components hand a take to: where it is uploaded, and — for practice — how a judgement comes back |

## The flow

1. The learner records a take in the browser. lk-react's `<ReadAloud>` and `useSpeechRecorder` produce 16 kHz mono 16-bit PCM WAV, which `inspectWav` measures directly; a capture of your own built on `MediaRecorder` produces a compressed format that needs a decoder on your side.
2. The browser uploads the take to your storage and receives an opaque key — with `<ReadAloud>`, through `recordingBinding.upload`. The learner response stores that key: `{ type: 'read-aloud', recording: { key, mimeType } }`. A `recording.durationMs` and a `takes` count may ride along, and no grade reads either — a duration the browser reports is a claim, not a measurement.
3. On your server:
   - Load the item by id, never from the browser.
   - Fetch the bytes by key and check that the key belongs to the learner.
   - Measure them with `inspectWav`.
4. Your adapter sends the audio, the item's `referenceText` and its `locale` to the assessor, then maps the reply into a `SpeechAssessment`. Store the raw reply as well.
5. Grade with `gradeReadAloud(item, response, assessment, { measured, plausibility })`, which returns a `GradeRecord` or `{ unscorable: true, code, reason }`.
6. Store the grade. A review screen renders it, plus the per-word marks from `alignReadAloud`.

`evaluate(item, response)` returns `{ status: 'deferred', reason: 'requires_async_grading', maxScore: 1, partial: { hasRecording } }` for a read-aloud: the SDK cannot grade audio by itself, and `hasRecording` is all a synchronous pass can say — true when the response carries a recording whose `key` is a non-empty string. **Deferred** here is a scoring kind, not a delay. Your server can grade within the same request, in a background job, or on demand.

`score('read-aloud', item, response)` throws `DeferredScoringError` for a read-aloud rather than inventing a number. `score` takes the type first, where `evaluate` reads it from the data; pass the item where the type belongs and you get `UnknownActivityTypeError` about a type named `[object Object]` instead. Use `evaluate`, and `gradeReadAloud` once you hold evidence.

## The item

```jsonc
{
  "schemaVersion": "1.0",
  "type": "read-aloud",
  "id": "ra-weather-1",
  "title": "Read the sentence",
  "instructions": "Read at a natural pace.",
  "referenceText": "The weather is lovely today, so we will walk to the park.",
  "locale": "en-US",
  "media": { "type": "audio", "url": "https://cdn.example.com/model/weather-1.mp3" },
  "slowMedia": { "type": "audio", "url": "https://cdn.example.com/model/weather-1-slow.mp3" },
  "recording": { "maxSeconds": 20, "minSeconds": 1, "maxTakes": 3 },
  "scoring": {
    "dimensions": [
      { "name": "accuracy", "weight": 3 },
      { "name": "fluency", "weight": 1 },
      { "name": "completeness", "weight": 1 }
    ]
  },
  "passThreshold": 0.7
}
```

- **`referenceText`** is shown to the learner, so redaction keeps it.
  - It is limited to 2000 code points, before and after normalisation (`READ_ALOUD_MAX_REFERENCE_LENGTH`).
  - It must leave a word once punctuation and spacing are folded away. `"..."`, `"— — —"` and `"¿?"` are refused: they tokenise into no word at all, so a silent take would record no omission and a perfect reading would align as one insertion after another. The draft checker reports the same as `ra_reference_text_unreadable`.
  - Text in a script written without spaces between words (Chinese, Japanese, Thai, Lao, Khmer, Myanmar) is refused for now, because per-word marks need word boundaries the SDK does not compute.
- **`locale`** decides the grade: an assessment made for another locale is unscorable. It must be a canonical BCP 47 tag with a region, such as `en-US`, `es-MX` or `pt-BR` — a lowercase language, an optional title-case script, and a region of two capitals or three digits. The SDK compares it exactly, because canonicalising at grade time would make a stored grade depend on the runtime's `Intl` data.
- **`recording`** bounds a take: `maxSeconds` above 0 and at most 300 (`READ_ALOUD_MAX_SECONDS`), `minSeconds` below `maxSeconds`, and `maxTakes` a whole number from 1 to 20 (`READ_ALOUD_MAX_TAKES`).
- **`scoring.dimensions`** decides how the engine's dimensions weigh into the grade: one to four of `accuracy`, `fluency`, `completeness` and `prosody`, each named once, each weight from 0 to 1000, and at least one above 0.
  - **It has no default, and a new draft starts with none.** An untouched draft must not quietly become a grading rule. The weights are pedagogy, and yours to choose.
  - Every dimension with a weight above 0 is **required** of the assessment: if it is missing, the result is unscorable rather than silently reweighted.
  - A dimension weighted 0 is not required, and does not move the grade.
  - With Azure, prosody exists only for `en-US`, so weight `prosody` only on `en-US` items.
  - Some engines' completeness correlates weakly with human raters, so calibrate before weighting it heavily.
- **`media`** and **`slowMedia`** are the model recording and an optional slower one. Both must be audio. `slowMedia` needs `media`, must be a different file, and cannot sit beside a play limit (`media.playback.maxPlays`), because a budget on one file and a free second file of the same reading is no budget.
- **The weights, the bounds and the text are all public.** A read-aloud item has no answer key, so `redact()` removes the authored pass/fail `feedback`, marks the copy `redacted: true`, and keeps everything else — a projection a learner may render in full. Grade against the full item, never the projection: `gradeReadAloud` refuses one.

## The evidence: `SpeechAssessment`

An assessor adapter produces this shape. Check it with `validateSpeechAssessment(value)`, which returns `{ success: true, data }` or `{ success: false, errors }` — one error per problem, each with the `path`, `message` and `code` `validateActivity` gives a schema failure. It answers rather than throwing: a non-object, an unknown key at any depth, a score off the scale, a time that is negative or not finite all come back as errors. The one exception is a value that throws when it is read — an own property getter, or a `Proxy` trap — where the throw is its own. It checks the evidence alone: whether an assessment belongs to an item and to a learner's recording is decided when it is graded. Every object is strict, so a misspelt key is an error, never silently ignored.

```ts
interface SpeechAssessment {
  assessmentVersion: '1.0';
  status: 'assessed' | 'no_speech';
  task: 'scripted' | 'unscripted';      // read-aloud grades scripted assessments only
  locale: string;                        // the locale actually assessed, canonical
  referenceText?: string;                // scripted: the item's referenceText, VERBATIM
  recordingKey?: string;                 // scripted: the key of the recording assessed
  assessor: { kind: 'auto' | 'ai' | 'human'; id?: string; model?: string; promptHash?: string };
  scale: 100;                            // every score is 0..100; convert other scales in the adapter
  scores: { accuracy?: number; fluency?: number; completeness?: number; prosody?: number; overall?: number };
  recognizedText?: string;
  miscue: 'assessor' | 'none';           // did the assessor mark omissions and insertions?
  phonemeAlphabet?: 'ipa' | 'sapi';      // required when a phoneme names a symbol, or what it was heard as
  words: SpeechWord[];                   // at most 1000 (SPEECH_ASSESSMENT_MAX_WORDS), 8000 characters between them: written, and normalised
  prosody?: { monotoneConfidence?: number };
  signal?: { snrDb?: number };
}
interface SpeechWord {
  text: string;
  accuracy?: number;                     // absent means "not assessed" — never write 0 for absent
  error: 'none' | 'mispronunciation' | 'omission' | 'insertion';
  vendorError?: string;                  // the engine's own label, kept verbatim
  startMs?: number; durationMs?: number; // milliseconds from the start of the recording
  syllables?: { text: string; grapheme?: string; accuracy?: number; startMs?: number; durationMs?: number }[];
  phonemes?: { symbol?: string; accuracy?: number; startMs?: number; durationMs?: number;
               heardAs?: { symbol: string; score: number }[] }[];
  breaks?: { unexpected?: number; missing?: number };   // confidences 0..1, for display
}
```

Three rules span fields, and an adapter meets all three or the evidence is refused:
- **`scripted_binding_required`** — a `scripted` assessment carries `referenceText` and `recordingKey`, reported at each missing path. They are what lets a grade refuse evidence made against another text or another take.
- **`phoneme_alphabet_required`** — a phoneme that names a `symbol`, or what it was `heardAs`, needs `phonemeAlphabet`, reported at `phonemeAlphabet`. A symbol whose alphabet nobody declared cannot be rendered or compared.
- **`too_big` at `words`** — the words carry at most 8000 characters between them, four times the longest reference text an item may carry, and that total is taken twice: over the `text` as written, in UTF-16 units, and over what those words spell once normalised, in code points, counting the single space that joins each token to the last. **Every word is charged, an insertion included** — an insertion contributes no token to the reference alignment, but its text is still normalised and still comes back from `alignReadAloud` as an `inserted` entry, so exempting it would leave a bound anyone could step around by setting one field. The per-word cap of 200 bounds no total: the marks are made by aligning tokens, and one word yields as many as its text spells, so a thousand long words would cost a grading job seconds of CPU and hundreds of megabytes. The two totals are not the same number, because one written character can stand for eighteen normalised ones — a reading well inside the first budget can still overrun the second, and the second is the one the aligner spends. Each message names the total that was exceeded, and `gradeReadAloud` turns either into `invalid_assessment` — a refusal, never a zero.

Rules that matter:
- **Absent is not zero.** A dimension the engine did not measure stays absent. An adapter that writes `0` for "not measured" turns a missing measurement into a failing grade.
- **The scale is declared.** An engine that reports 0–5 must be converted to 0–100 by the adapter, or configured to report 0–100. The SDK cannot tell 4.1 meant "out of 5" from 4.1 out of 100.
- **Times are milliseconds from the start of the recording.** Convert engine units, and re-base segment offsets.
- **Word and syllable scores are the engine's own.** Do not recompute them from phoneme scores; engines do not average.
- **`assessor.kind`:**
  - `'auto'` is a measurement engine;
  - `'ai'` is a generative model;
  - `'human'` is a person.
  - Provenance beyond these fields (provider, API version, region, configuration) belongs in your own storage.

## Grading: `gradeReadAloud`

```ts
const result = gradeReadAloud(item, response, assessment, {
  measured: { durationMs: wav.durationMs, voicedMs: wav.voicedMs }, // your server's inspectWav result
  plausibility: { maxWordsPerSecond: 6, minVoicedMs: 800 },       // YOUR policy; these are example values
  // allowAiAssessor: true,       // accept assessor.kind 'ai' evidence (off unless set)
  // rounding: { mode: 'half-up', dp: 2 },   // compare the pass line as displayed
});
```

**Required arguments, no defaults.** `measured` and `plausibility` have no defaults, because every value in them decides whether a grade exists. `measured` must come from your server's measurement of the stored recording, never from the browser or the assessor.

**Invalid input throws, and these checks run before any evidence is read**, in this order:

1. `RangeError` — `plausibility.maxWordsPerSecond` is not a finite number above 0, or `minVoicedMs` not a finite number at or above 0. Your own configuration comes first: a server that cannot apply its policy is not grading anything, and answering every take "unscorable" would hide the bug.
2. `RangeError` — `rounding` cannot be applied (an unknown `mode`, or a `dp` that is not a whole number from 0 to 15).
3. `ActivitySchemaError` — `item` is not valid read-aloud data.
4. `RedactedScoringError` — `item` carries `redacted: true`, the marker `redact()` stamps on a projection. A marker the item merely inherits counts too.
5. `TypeError` — `response` is not `{ type: 'read-aloud', recording: null }` or a recording with a non-empty `key` and a `mimeType`.
6. `TypeError` — a response that carries a recording was passed without an assessment, or without `options.measured`. Missing either is a caller's bug, not evidence the SDK could refuse on its merits.
7. `RangeError` — `measured` is not a pair of finite, non-negative millisecond counts with `voicedMs` inside `durationMs`.

Steps 1 to 5 run for a blank too, so a blank still needs a plausibility policy it can apply. Steps 6 and 7 do not.

**Why step 4 matters more here than the same check does elsewhere.** Read-aloud's projection keeps every field the grade reads — the text, the locale, the weights, the pass line — so it is itself a valid activity. Take the marker off one and `gradeReadAloud` returns the same plausible number it would have returned for the full item, with only the authored `feedback` silently missing. A type whose projection drops an answer key fails closed instead: its scorer can compute no finite score, and `score()` turns that into this same error rather than a number. Written-response's projection is also a valid activity of its own type, but written-response is graded asynchronously and has no synchronous grader to fool. Read-aloud is graded asynchronously too — `gradeReadAloud` is simply a public grader that never goes through `score()`, which is why the check lives here as well. Grade against the full item on your server. And note that `evaluate()` does not throw for a projection: it answers `deferred`, exactly as it does for the full item, so an item that looks merely unassessed may be one you handed the learner's copy of.

**The grade reads the item and the evidence as the schema parsed them**, not as they were passed. A property getter cannot answer the validator one value and the arithmetic another.

**A blank** (`recording: null`, submitted without recording) grades 0, with every reference word marked omitted and no `grader`, because nobody measured it. No assessment is needed, and `measured` is not read. `evaluate()` still returns `deferred` for it, so call `gradeReadAloud` at submit time.

**Otherwise the checks run in this order**, and the first that fails decides the code:

| Code | When |
|---|---|
| `invalid_assessment` | `validateSpeechAssessment` refuses the evidence |
| `task_mismatch` | the assessment is not scripted |
| `locale_mismatch` | `assessment.locale` differs from the item's `locale` |
| `reference_mismatch` | `assessment.referenceText` differs from the item's `referenceText` (exact) |
| `recording_mismatch` | `assessment.recordingKey` differs from the response's key |
| `assessor_not_accepted` | `assessor.kind` is `'ai'` without `allowAiAssessor` |
| `no_speech` | the assessor found no speech |
| `insufficient_voiced_time` | `measured.voicedMs` is below `plausibility.minVoicedMs` |
| `implausible_speech_rate` | more words per second of voiced time than `maxWordsPerSecond` allows — exactly the limit is still plausible — and any word at all when `voicedMs` is 0 |
| `missing_dimension` | a dimension weighted above 0 has no score |

**How the words of the speech-rate check are counted.** From `recognizedText` with `countWords` when the assessor reported recognised text that is not blank; otherwise from the words it kept — `text` joined by a space, omissions and insertions excluded, counted the same way. An omission was not spoken, and an insertion is not in the text. The count is never taken from a number the assessor reports, and `countWords` is the counter the SDK counts a written response with, so a rate compared against your policy is counted the same way every time. Both paths are pinned by grade vectors.

`invalid_assessment` has a second, defensive route: an item and an assessment that pass every check above but from which `gradeFromRubric` can still compute no weighted total. No argument reaches it — the grade reads both the item and the evidence as the schema parsed them, so neither can answer one value to a check and another to the arithmetic. It stands because the alternative to a refusal is inventing a number, and because `gradeFromRubric` is a separate module that could one day refuse for a reason this one does not know.

**When every check passes:**
- The weighted dimensions become rubric criteria out of 100, in authored order, and `gradeFromRubric` computes the weighted total. Weights are normalised by their sum, so they need not add to 1, and `GradeRecord.criteria` carries them for a review screen to show.
- The pass line is the item's `passThreshold` (default 0.7), compared with `options.rounding` when given. The score itself is never rounded.
- `GradeRecord.details` carries one mark per reference word (`w1`, `w2`, … in reading order):
  - `correct` for a word pronounced correctly;
  - `incorrect` for a mispronounced word;
  - `incorrect-omission` for an omitted word, with `score` 0;
  - otherwise `score` is the word's accuracy divided by 100, or absent when the engine gave none.
- Inserted words have no mark.
- **Word marks never change the item score.**
- `grader` is copied from `assessment.assessor`.

**Marks for a review screen.** `alignReadAloud(item, assessment)` returns the same comparison as a list the screen can render: every reference word with its state (`correct`, `mispronounced` or `omitted`), and every inserted word in the order it was spoken. `wordIndex` points back into `assessment.words`, so syllables, phonemes and timings are one lookup away. lk-react's `<PronunciationFeedback>` renders exactly this, and checks the evidence before it aligns it.

- It throws `TypeError` for an assessment `validateSpeechAssessment` refuses; check the evidence before you align it.
- **It checks the evidence and trusts the item.** `alignReadAloud` never validates `item`: `{}`, a number, or `{ referenceText: 42 }` each come back as a list of insertions rather than a refusal, and a `referenceText` past `READ_ALOUD_MAX_REFERENCE_LENGTH` is cut with no signal — 700 words of a 3499-code-point text align as 400 marked words. (A `null` item throws a bare `TypeError` from the property read, which is not a refusal either.) Validate the item once, where you load it. The grading entry point needs no such care because `gradeReadAloud` runs the schema itself; this is the raw aligner's disclosure, and it is what keeps a renderer's per-frame call from re-validating an item it already trusts.
- `reference` and `heard` are **normalised** — lowercased, with punctuation and spacing folded away — because that is what was compared. Show the authored text beside them if your screen needs the original spelling.
- **`heard` is `''` for an omitted word, and also for an inserted word whose text normalises to nothing** (an assessor can tag a dash as an insertion, and every insertion gets an entry so a reader of `wordIndex` finds each word it looks for). Branch on `state`, never on the empty string, or an insertion renders as an omission.

**Storing the result.**
- A grade lifts into an item outcome with `outcomeFromGrade(grade)`; its marks are at `outcome.grade.details`.
- An unscorable result lifts with `outcomeFromUnscorable(result)`, which keeps its `code`.
- In `composeAssessmentScore`:
  - a `deferred` read-aloud keeps the result provisional, never zero;
  - an `unscorable` one is left out of the total, and the result can still finalise.
- So route unscorable speaking items to a re-record or a human **before** you release a verdict, or a learner could avoid a speaking item by recording silence.

## Measuring a recording: `inspectWav`

```ts
const wav = inspectWav(bytes, { silenceDbfs: -45, frameMs: 20 });   // example policy
if (!wav.valid) {
  // wav.reason: 'not_wav' | 'unsupported_encoding' | 'truncated'
}
```

- **Input:** 16-bit PCM WAV, any rate, any number of channels. Both policy fields are required, because neither has an answer that is right for every microphone: `silenceDbfs` is where you draw the line between silence and speech, and `frameMs` is how finely you look.
- **Output:**
  - `durationMs`, from the whole frames the `data` chunk declares;
  - `sampleRate`, `channels`, `bitsPerSample`;
  - `peakDbfs`, the loudest sample across every channel (`-Infinity` for digital silence, and for a file with no frames, where a 0 would read as full scale);
  - `voicedMs`: the time in windows of `frameMs` whose RMS level reaches `silenceDbfs` — windows, not single samples, and the last window is as long as what is left of the recording. It never exceeds `durationMs`, which is what `gradeReadAloud` requires of `measured`.
- **It never throws on the bytes themselves**, only on arguments it cannot use: `TypeError` when `bytes` is not a `Uint8Array`, `RangeError` when `silenceDbfs` is not a finite number at or below 0, or `frameMs` not a finite number above 0.
- **What each refusal means:**

  | `reason` | When |
  |---|---|
  | `not_wav` | no `RIFF`/`WAVE` signature; or the chunks do not describe the audio before it arrives — a `data` chunk before any `fmt ` chunk, or no `fmt ` chunk at all |
  | `unsupported_encoding` | a `fmt ` chunk this reader does not read: compressed, samples that are not 16-bit, no channels or no sample rate, a `blockAlign` that disagrees with them, fewer than 16 bytes of it present, or an extensible chunk whose `SubFormat` is past the end of the file |
  | `truncated` | no `data` chunk, or one declaring more bytes than the file holds. A `fmt ` chunk declaring more than the file carries lands here too, and not under `unsupported_encoding`: its first 16 bytes describe the audio perfectly well, and stepping over the size it declares walks past where `data` should have been — which is what a file cut short looks like |

- **Use it before paying for an assessment.** A take shorter than your item's bounds, or with almost no voiced audio, never needs an assessor. An assessor, and a language model especially, can report fluent speech for a silent file.
- **16 kHz mono WAV is the format to capture**, the one every mainstream assessor accepts and this function measures exactly. Other formats need their own decoder on your side. lk-react's `useSpeechRecorder` produces exactly this and nothing else.

## In the browser: lk-react

`@intellectif/lk-react` 14.0.0 carries the half of a read-aloud that runs in front of the learner: a recorder that produces the WAV `inspectWav` measures, a component that records a take and hands it to your storage, and a panel that marks the result. None of them assesses anything. A take leaves through a binding you write and a judgement comes back through one, so the storage, the assessor and its keys stay on your side of the line.

### Recording a take: `<ReadAloud>`

```tsx
import type { ActivityResult, LearnerResponse, ReadAloudData } from '@intellectif/lk-core';
import {
  ReadAloud,
  type ReadAloudAssessResult,
  type RecordingBinding,
} from '@intellectif/lk-react/components/ReadAloud';

export function ReadAloudItem(props: {
  item: ReadAloudData;
  onSubmit: (response: LearnerResponse) => void;
  onComplete: (result: ActivityResult) => void;
}) {
  const takes = `/api/items/${encodeURIComponent(props.item.id)}`;
  const recordingBinding: RecordingBinding = {
    // Required outside `review`: store the bytes, and return the key you stored them under.
    async upload(take) {
      const res = await fetch(`${takes}/takes`, {
        method: 'POST',
        headers: { 'content-type': take.mimeType },
        body: take.blob,
      });
      if (!res.ok) throw new Error(`the take was not stored: ${res.status}`);
      const { key } = (await res.json()) as { key: string };
      return { key, mimeType: take.mimeType };
    },
    // `practice` only, and optional: your server assesses and grades the STORED take.
    async assess(ref) {
      const res = await fetch(`${takes}/assessments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: ref.key }),
      });
      if (!res.ok) return { status: 'failed', retryable: res.status >= 500 };
      return (await res.json()) as ReadAloudAssessResult;
    },
  };
  return (
    <ReadAloud
      data={props.item}
      recordingBinding={recordingBinding}
      onSubmit={props.onSubmit}
      onComplete={props.onComplete}
    />
  );
}
```

- **`upload(take)`** receives a `RecordedTake` — `{ blob, mimeType, durationMs, peakLevel }` — and returns the `RecordingRef` the learner response carries. It is required in `practice` and `exam`, and a missing one throws at render, in production too: a recorder whose take is stored nowhere looks like a working activity the whole way through. A rejection offers the learner a retry and submits nothing, so a take that failed to upload never becomes a blank answer.
- **`assess(ref)`** is `practice` only, and optional. It returns a `ReadAloudAssessResult`:
  - `{ status: 'graded', assessment, grade }` shows the score and the marks, and calls `onComplete`;
  - `{ status: 'unscorable', code, assessment? }` tells the learner "We could not hear you. Record again somewhere quieter." for `no_speech` and `insufficient_voiced_time`, and "This recording could not be assessed. Try recording it again." for any other code, and offers another take if one remains. The code is never shown. It is a `string` rather than `SpeechUnscorableCode`, so your own assessor may refuse for reasons the SDK has no name for;
  - `{ status: 'failed', retryable }` offers a retry when `retryable` is true.

  Without `assess` the take is still recorded, uploaded and submitted, and a notice replaces the feedback. That is what `<ActivityPreview>` shows an author, whose preview has no assessor to call.
- **`playbackUrl(ref)`** is `review` only: a playable link to the stored take, for the learner's recording and the per-word play buttons.

| `renderMode` | What `<ReadAloud>` does |
|---|---|
| `practice` (default) | Record, play the take back, upload, `onSubmit`, then `assess`. A grade calls `onComplete` with the grade's own `score` and `maxScore`, and an xAPI statement whose `score.scaled` is the grade as a fraction of 1 |
| `exam` | Record, upload, `onSubmit`, then locked. It never assesses, scores, reveals or builds a statement. A learner hands in no recording only through the explicit "Submit without recording" control, which submits `recording: null` |
| `review` | Renders `outcome`. A graded one shows its score, marked from the `assessment` prop when you pass one and rebuilt from `outcome.grade.details` otherwise — without syllables, sounds or insertions then, because the details record the reference words alone. With neither, the score and no marks. A deferred outcome reads "Not graded yet. This response is waiting for its grade."; an unscorable one reads "This response could not be graded.", with its code on `data-code` and never as text |

The item's `recording` bounds the take: `maxSeconds` stops a take by itself, `minSeconds` refuses a shorter one, and `maxTakes` is the budget. While a take is being recorded the model recordings stay silent and the per-second counter is not announced, so the microphone picks up neither the model nor a screen reader reading the counter out; the start and the end of the take are announced once each instead.

The endpoint `assess` calls is the [flow](#the-flow) above. On your server, with example policy values:

```ts
import {
  gradeReadAloud,
  inspectWav,
  outcomeFromGrade,
  outcomeFromUnscorable,
} from '@intellectif/lk-core';

export async function assessStoredTake(learnerId: string, itemId: string, key: string) {
  const item = await loadItem(itemId); // the full item, never the learner's copy
  const bytes = await readTake(learnerId, key); // refuses a key this learner does not own
  const wav = inspectWav(bytes, { silenceDbfs: -45, frameMs: 20 });
  if (!wav.valid) {
    return { status: 'unscorable', code: wav.reason } as const;
  }
  const assessment = await assessWithYourEngine(bytes, item, key); // your adapter
  const result = gradeReadAloud(
    item,
    { type: 'read-aloud', recording: { key, mimeType: 'audio/wav' } },
    assessment,
    {
      measured: { durationMs: wav.durationMs, voicedMs: wav.voicedMs },
      plausibility: { maxWordsPerSecond: 6, minVoicedMs: 800 },
    },
  );
  if ('unscorable' in result) {
    await saveOutcome(learnerId, itemId, outcomeFromUnscorable(result));
    return { status: 'unscorable', code: result.code, assessment } as const;
  }
  await saveOutcome(learnerId, itemId, outcomeFromGrade(result));
  return { status: 'graded', assessment, grade: result } as const;
}
```

What it returns is the JSON the `assess` above passes back as a `ReadAloudAssessResult`.

### In a question set

`<ActivitySequence>` renders every `read-aloud` slot through `<ReadAloud>` and takes one binding for the whole set. Each of its methods is also told which slot the take belongs to, as `{ slotId, index, activityId }` — the shape `onSubmit` already passes — so an answer and its recording are filed under one identity. Store against `slotId`: `index` is where the question was presented, and it moves under shuffling.

```tsx
import type { ActivityResult, LearnerResponse, SequenceEntry } from '@intellectif/lk-core';
import type {
  ReadAloudAssessResult,
  RenderableActivity,
  SequenceItemOutcome,
  SequenceRecordingBinding,
} from '@intellectif/lk-react';
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';

export function Practice(props: {
  attemptId: string;
  entries: readonly SequenceEntry<RenderableActivity>[];
  saveResponse: (slotId: string, response: LearnerResponse) => void;
  saveResult: (slotId: string, result: ActivityResult) => void;
  finish: (items: SequenceItemOutcome[]) => void;
}) {
  const slots = `/api/attempts/${encodeURIComponent(props.attemptId)}/slots`;
  const recordingBinding: SequenceRecordingBinding = {
    async upload(take, slot) {
      const res = await fetch(`${slots}/${slot.slotId}/takes`, {
        method: 'POST',
        headers: { 'content-type': take.mimeType },
        body: take.blob,
      });
      if (!res.ok) throw new Error(`the take was not stored: ${res.status}`);
      const { key } = (await res.json()) as { key: string };
      return { key, mimeType: take.mimeType };
    },
    async assess(ref, slot) {
      const res = await fetch(`${slots}/${slot.slotId}/assessments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: ref.key }),
      });
      if (!res.ok) return { status: 'failed', retryable: res.status >= 500 };
      return (await res.json()) as ReadAloudAssessResult;
    },
  };
  return (
    <ActivitySequence
      activities={props.entries}
      recordingBinding={recordingBinding}
      onSubmit={(response, slot) => props.saveResponse(slot.slotId, response)}
      onActivityComplete={(result, _index, slotId) => props.saveResult(slotId, result)}
      onFinished={props.finish}
    />
  );
}
```

A finished attempt is reviewed from what the server stored. `assessments` carries the `SpeechAssessment` behind each grade, keyed by `slotId` like `outcomes`, and is read live rather than at mount, because evidence fetched beside an attempt can land after the first paint:

```tsx
import type { ItemOutcome, LearnerResponse, SequenceEntry, SpeechAssessment } from '@intellectif/lk-core';
import type { RenderableActivity } from '@intellectif/lk-react';
import { ActivitySequence } from '@intellectif/lk-react/components/ActivitySequence';

export function Review(props: {
  entries: readonly SequenceEntry<RenderableActivity>[];
  responses: Readonly<Record<string, LearnerResponse>>;
  outcomes: Readonly<Record<string, ItemOutcome>>;
  assessments: Readonly<Record<string, SpeechAssessment>>;
  playbackUrlFor: (slotId: string, key: string) => Promise<string>;
}) {
  return (
    <ActivitySequence
      activities={props.entries}
      renderMode="review"
      responses={props.responses}
      outcomes={props.outcomes}
      assessments={props.assessments}
      recordingBinding={{
        // A review never uploads, but the type asks for `upload` in every mode.
        upload: () => Promise.reject(new Error('a review stores nothing')),
        playbackUrl: (ref, slot) => props.playbackUrlFor(slot.slotId, ref.key),
      }}
    />
  );
}
```

**How a `practice` read-aloud slot completes.** Its grade arrives after the submit that answered it, so it completes differently from every other practice slot:

- **On submit it records a `responded` outcome**, as every slot does in `exam`. An unscorable take, a failed assessment or a binding with no `assess` therefore cannot keep `onFinished` from firing.
- **A grade replaces that `responded` with a `scored` outcome** and reaches `onActivityComplete`. A learner who records again after a grade has the new grade recorded too, so `onActivityComplete` fires once per graded take, for the same `slotId`. A `responded` never replaces a grade: a later take that comes back ungraded leaves the earlier grade in the slot, although `onSubmit` has already reported the later take — which is why a response and a grade are stored as the separate records they are.
- **`onFinished` waits for an assessment in flight.** When the last slot is filled while a read-aloud is still being assessed, the set is reported once, when the assessment ends: with the grade in place, or with `responded` when none came back. An assessment that never settles leaves the set unreported, so settle every promise `assess` returns.
- **A take that could not be stored still completes its slot**, as `{ kind: 'responded', response: { type: 'read-aloud', recording: null } }` with no `takes`. It is reported through `onFinished` only, never through `onSubmit`, and a retry that stores the take replaces it.
- **`onFinished` and `onComplete` fire once per set.** A take after that reaches you through `onSubmit`, and its grade through `onActivityComplete`.
- **An outcome from a paper the sequence has since been handed is refused**, for every activity type: one that arrives after `activities` changed, and does not match the `slotId` and `activityId` of the slot now at its index, reaches no callback.

A `renderers` entry for `read-aloud` receives neither `recordingBinding` nor `assessment`: a renderer is a `ComponentType<ActivityProps>`, so whoever writes one wires its binding.

### Showing the marks: `<PronunciationFeedback>`

```tsx
import type { GradeRecord, ReadAloudData, SpeechAssessment } from '@intellectif/lk-core';
import { PronunciationFeedback } from '@intellectif/lk-react/components/PronunciationFeedback';

export function Marks(props: {
  item: ReadAloudData;
  assessment: SpeechAssessment;
  grade: GradeRecord;
  audioUrl: string;
}) {
  return (
    <PronunciationFeedback
      data={props.item}
      assessment={props.assessment}
      grade={props.grade}
      audioUrl={props.audioUrl}
      breakThreshold={0.75}
      monotoneThreshold={0.6}
    />
  );
}
```

`data` needs only `referenceText` and `locale`. The panel shows the score when you pass a `grade`, and the four dimensions — from `grade.criteria` when the grade carries any, from `assessment.scores` otherwise — each a percentage or "Not assessed", **never 0%**. Then it marks every entry `alignReadAloud` returns as `correct`, `mispronounced`, `omitted` or `inserted`, with a hidden sentence per word for a screen reader and a glyph and a text decoration for everyone else. A word with detail opens onto its accuracy, its syllables, its sounds and what was heard instead of each, and, given `audioUrl` and timings, a button that plays just that word. A break note appears only past `breakThreshold` and the monotone note only past `monotoneThreshold`; neither has a default, because where a confidence becomes worth telling a learner is yours to decide.

**It checks the evidence before it aligns it**, because `alignReadAloud` throws for evidence `validateSpeechAssessment` refuses. In development the refusal is thrown as `ActivitySchemaError`, which the component's error boundary shows. In production the score and the dimensions are rendered and the word list is left out: a malformed assessment costs the learner the marks, never the grade.

### Recording without the component: `useSpeechRecorder`

`useSpeechRecorder({ maxDurationMs, minDurationMs?, maxTakes?, workletUrl? })` is the capture `<ReadAloud>` is built on. It returns `status` (`idle`, `requesting-permission`, `recording`, `recorded`, `error`), `error`, an input `level` from 0 to 1, `elapsedMs`, the `take`, `takesUsed`, `canRecord`, and `start`, `stop`, `discard` and `reset`.

- **The take is 16 kHz mono 16-bit PCM WAV**, whatever rate the device runs at: downmixed, low-pass filtered, resampled and encoded in the browser, so what your server measures is what the hook produced. `take.durationMs` is taken from the encoded samples.
- **The limit is counted from the samples, not from a timer.** A take stops itself when it holds `maxDurationMs` of audio. One shorter than `minDurationMs` becomes `error: 'too-short'` and no take, and `canRecord` turns false once `takesUsed` reaches `maxTakes`.
- **`discard()` gives no take back**, because a budget a re-record refunded would bound nothing. `reset()` does, for a recorder that has been handed a different reading while it stayed mounted.
- **`start()` never rejects.** A refusal becomes `error`: `permission-denied`, `no-device`, `unsupported` or `failed`. Support is discovered inside `start()` and never probed during render, so a server render and its hydration agree.
- **Everything it acquires is released** — the microphone's tracks and the audio context — on stop, discard, error and unmount.

**A strict Content-Security-Policy.** The capture runs in an audio worklet whose module the hook loads from a `blob:` URL. A worklet module is loaded as a script, so it is `script-src` that must allow `blob:`; `worker-src` does not govern it. Where yours does not, serve `CAPTURE_PROCESSOR_SOURCE`, exported beside the hook, from a URL your `script-src` allows, and pass that URL as `workletUrl`. Write the file from the installed package at build time, so it moves with the version you run:

```ts
import { writeFileSync } from 'node:fs';
import { CAPTURE_PROCESSOR_SOURCE } from '@intellectif/lk-react/hooks/useSpeechRecorder';

writeFileSync('public/lk-speech-capture.js', CAPTURE_PROCESSOR_SOURCE);
```

The module must register an `AudioWorkletProcessor` named `lk-speech-capture` that posts a copy of each block of its first input's channels to its port. Serve the constant unchanged rather than a processor of your own, because anything else changes what is recorded. **A `workletUrl` that does not work is not reported:** a module that fails to load, or loads without registering that processor, sends the hook to its fallback for engines without audio worklets — the deprecated `ScriptProcessorNode`, on the main thread — and the recorder looks as if it works. Check that the module is fetched.

## Trust

- **Assess on your server for anything that counts.** Evidence posted by a browser can be forged; the SDK validates its structure but cannot authenticate it. For exams and progress, the server fetches the stored recording, calls the assessor itself, and grades. A browser-side assessment is acceptable only for practice that feeds nothing.
- **The bindings catch honest mistakes, not forgeries.** Locale, reference text and recording key catch a result attached to the wrong take or item, or assessed in the wrong language. They are not tamper protection.
- **Keep the item's `referenceText` on the server.** Send it to the assessor from there, and have the adapter copy it verbatim into the assessment. If you send the engine a transformed text (for example with markup removed), record that in your request log, never in `referenceText`.

## Keeping a grade explainable

Store, for each assessed attempt:
- the recording, under your retention policy;
- the raw provider response, verbatim, with the request settings you sent;
- the `SpeechAssessment`;
- the `GradeRecord` or unscorable result;
- the lk-core version.

Three different operations then stay distinct:

| Operation | What it does | Reproducible? |
|---|---|---|
| **Recompute** | `gradeReadAloud` again on the stored assessment and measurement | Yes |
| **Re-assess** | Send the stored audio to the provider again | No: providers update their models, and generative models vary between identical runs. Treat it as a new, dated result |
| **Re-map** | Map the stored raw response again with a newer adapter | An explicit regrade, never a silent one |

## AI assessors

A generative model can assess a recording. Published comparisons, however, find zero-shot models agree far less with human raters than dedicated pronunciation engines at word and phoneme level. They are also more lenient, and vary between identical runs. They do comparatively well on holistic judgements and on explaining results.

`gradeReadAloud` therefore refuses `assessor.kind: 'ai'` evidence unless you pass `allowAiAssessor: true`. When you do, label the feedback accordingly. A model is well suited to explaining an engine's marks to the learner. That explanation is display text, and never enters the grade.

---

## Appendix: filling `SpeechAssessment` from Azure pronunciation assessment

Microsoft's pronunciation assessment (Azure AI Speech) is a common engine for this type. This appendix records the details that decide whether an adapter produces correct evidence. It reflects Microsoft's documentation and JavaScript SDK behaviour as of September 2026. **Capture real responses from your own resource before relying on any mapping,** because the published examples disagree with each other in places.

### Request settings

- **`GradingSystem: HundredMark`.** The default is `FivePoint` (0–5) in the REST API, the documentation and the JavaScript SDK constructor. An adapter that forgets this produces scores `validateSpeechAssessment` cannot distinguish from low 0–100 scores.
- **`Granularity: Phoneme`** returns word, syllable and phoneme scores.
- **`Dimension: Comprehensive`** on REST. The REST default is `Basic`, which is accuracy only. The JavaScript SDK always sends `Comprehensive`.
- **`EnableMiscue: true`** marks omitted and inserted words; set `miscue: 'assessor'`. It is not available in continuous recognition (below).
- **`EnableProsodyAssessment: true`** only for `en-US`.
- **Language:** always pass the item's `locale` (REST `language=` query parameter; SDK `speechRecognitionLanguage`). The SDK default is `en-US`, so an adapter that never sets it assesses every language as English.
- **REST short audio:**
  - the query also needs `format=detailed` (the default `simple` returns no scores);
  - send `Content-Type: audio/wav; codecs=audio/pcm; samplerate=16000`;
  - the `Pronunciation-Assessment` header is the base64 of the UTF-8 JSON settings;
  - the documented request limit is 60 s of audio, and Microsoft advises at most 30 s for pronunciation assessment;
  - `PhonemeAlphabet` and `NBestPhonemeCount` appear in Microsoft's REST samples but not in its REST parameter table, so verify them on your resource.
- **The JavaScript Speech SDK accepts uncompressed PCM only** (WAV, 16 kHz 16-bit mono by default). It does not decode Opus, WebM or MP3.
- **Continuous recognition** (for recordings longer than single-shot handles, about 15–30 s) returns one assessment per segment and no utterance total, and does not mark omissions or insertions. Aggregating segments is a grading policy you own and version. Until you have one, keep items within single-shot or REST lengths. A reading long enough to need it also approaches the caps on evidence: 1000 words, and 8000 characters between them, written or normalised.
- **Content assessment** (vocabulary, grammar, topic) was retired from the Speech SDK in 2025.

### Mapping the response

| Azure (detailed JSON) | `SpeechAssessment` |
|---|---|
| `NBest[0].PronunciationAssessment.AccuracyScore` (SDK JSON; REST puts the five scores directly on `NBest[0]`) | `scores.accuracy` |
| `FluencyScore` / `CompletenessScore` / `ProsodyScore` | `scores.fluency` / `scores.completeness` / `scores.prosody`, **only when present** |
| `PronScore` | `scores.overall` (display and monitoring; the grade uses the weighted dimensions) |
| `DisplayText`, or `NBest[0].Lexical` | `recognizedText` (prefer `Lexical`: numbers stay words) |
| `NBest[0].Words[]` | `words[]` |
| `Word` | `text` |
| `…AccuracyScore` on the word | `accuracy` |
| `ErrorType` `None` / `Mispronunciation` / `Omission` / `Insertion` | `error` `none` / `mispronunciation` / `omission` / `insertion` |
| `ErrorType` `UnexpectedBreak` / `MissingBreak` / `Monotone` | `error: 'none'`, `vendorError` verbatim (these are prosody, not segmental errors) |
| `Offset`, `Duration` (100-nanosecond ticks) | `startMs = Offset / 10000`, `durationMs = Duration / 10000`, re-based to the recording start |
| `Syllables[]` (`Syllable`, `Grapheme`, score, `Offset`, `Duration`) | `syllables[]` (en-US only) |
| `Phonemes[]` (`Phoneme`, score, `Offset`, `Duration`) | `phonemes[]`. Phoneme names exist only for `en-US` (IPA or SAPI) and `zh-CN` (SAPI); elsewhere leave `symbol` out and keep the score |
| `NBestPhonemes[]` (`Phoneme`, `Score`) | `heardAs[]` (en-US; requires `NBestPhonemeCount`) |
| `Feedback.Prosody.Break.UnexpectedBreak.Confidence` / `MissingBreak.Confidence` | `breaks.unexpected` / `breaks.missing` (Microsoft suggests 0.75 as a display threshold) |
| `Feedback.Prosody.Intonation.Monotone.Confidence` (stamped on every word) | `prosody.monotoneConfidence`, once per utterance |
| `SNR` | `signal.snrDb` |

Three fields the response does not carry, which the adapter must add or the evidence is refused:

- `task: 'scripted'`, with the item's `referenceText` copied verbatim and the storage key of the take in `recordingKey` — the bindings a grade checks (`scripted_binding_required`).
- `phonemeAlphabet`, `'ipa'` or `'sapi'`, matching the `PhonemeAlphabet` you requested, whenever any phoneme carries a `symbol` or a `heardAs` candidate (`phoneme_alphabet_required`).
- `scale: 100` and `assessmentVersion: '1.0'`, and `miscue` — `'assessor'` when `EnableMiscue` was on, `'none'` when it was not.

### Status and silence

| Situation | Map to |
|---|---|
| `RecognitionStatus` `Success` with one or more words | `status: 'assessed'` |
| `InitialSilenceTimeout`, or `Success` with no words | `status: 'no_speech'` |
| `BabbleTimeout` (noise only) | `status: 'no_speech'`, or refuse with your own code |
| `NoMatch` | **Not silence**: speech that matched no words, usually the wrong language. Route it to review or a re-record; do not report `no_speech` |
| An error, or a missing status | No assessment. Report a provider failure, and retry if it is transient |

- The JavaScript SDK's JSON result writes `RecognitionStatus` as a name (`"Success"`), while documentation examples show `0`.
- Since SDK 1.44 the JavaScript SDK no longer emits `NoMatch` at all, so test what your version returns for silence, noise and wrong-language speech.

### Offsets in the JavaScript SDK

The JavaScript SDK shifts some offsets by the start of the current recognition turn and not others:
- With the default `Simple` output format, only the top-level `Offset` is shifted.
- With `Detailed`, word offsets are shifted too.
- Syllable and phoneme offsets are never shifted.

A single-shot first turn is unaffected. For continuous recognition, record the SDK version and output format with each result, and re-base per result.

### Other behaviour to expect

- **Scores are the engine's own.** A word's score is not the average of its phonemes, so do not recompute it.
- **Microsoft updates the models without an API change** (several locales in 2025 and 2026). The same audio can score differently later; store the raw response.
- **Authorization tokens** from `issueToken` last 10 minutes; Microsoft suggests reusing one for 9. A token works only against the host family that issued it. Keep the key on your server.
