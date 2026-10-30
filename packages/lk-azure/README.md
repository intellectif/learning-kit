# @intellectif/lk-azure

Reads [Azure AI Speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment) pronunciation assessment results into [`@intellectif/lk-core`](https://www.npmjs.com/package/@intellectif/lk-core)'s `SpeechAssessment`, the evidence `gradeReadAloud` grades a read-aloud take from.

**One pure function:** no network, no key, no Azure SDK and no clock. Your server calls Azure; this package reads what Azure sends back. Every rule in it comes from real responses: 59 cases captured in October 2026 on the Speech SDK for JavaScript 1.51.0 and the REST short-audio API, in eight locales, with synthesised speech, silence and noise. 41 of them are committed as its test data.

```bash
pnpm add @intellectif/lk-azure @intellectif/lk-core
```

`@intellectif/lk-core` is a peer: the assessment is checked by the lk-core you grade with.

## Use

```ts
import { assessmentFromAzure } from '@intellectif/lk-azure';
import { gradeReadAloud } from '@intellectif/lk-core/scoring';

// results: each `SpeechServiceResponse_JsonResult` of the take, in order (one
// for single-shot recognition or a REST request; every `recognized` result of
// continuous recognition), as text or parsed.
const read = assessmentFromAzure(results, {
  referenceText: item.referenceText, // sent as ReferenceText, verbatim
  locale: item.locale,
  recordingKey: response.recording.key,
  miscue: !continuous, // EnableMiscue, as sent
  gradingSystem: 'HundredMark',
  phonemeAlphabet: 'IPA', // as sent; Azure's default is SAPI
  assessorId: `azure/${region}/${item.locale}`,
});

if (!read.ok) {
  // The request, the service or the response, never the take: see the table
  // below. 'invalid_assessment' carries lk-core's `errors`.
  throw new Error(read.message);
}
const grade = gradeReadAloud(item, response, read.assessment, { measured, plausibility });
```

Store the raw results, the request settings and this package's version beside every assessment: a re-map of a stored response with a newer version is an explicit regrade.

## What it does

- **No word recognised is `no_speech`, never a 0.** Azure answers silence, background noise and a hum alike with a successful result in which every reference word is omitted, `DisplayText` is `"."`, and every score is 0. A `NoMatch`, `InitialSilenceTimeout` or `BabbleTimeout` result recognises no word either. Such a take becomes `status: 'no_speech'`, which `gradeReadAloud` reports as unscorable: the learner can be asked to record again. Measuring the recording does not catch noise.
- **That is also where prosody goes missing.** Azure leaves `ProsodyScore` out of a take in which it heard no word, and out of every take outside en-US. On the 45 en-US results that asked for prosody and heard at least one word, it was always there, even with one word heard of twelve. `gradeReadAloud` checks for no speech before it checks for a missing dimension, so a take of silence, noise or a hum on an item that weighs prosody is `no_speech`, not `missing_dimension`.
- **One result keeps Azure's own scores.**
- **Several results are scored over the whole take.** Continuous recognition splits a reading at its pauses and scores each piece on its own, so averaging the pieces would charge no pause between them and would read each piece's completeness as a share of the whole text. The take is scored as Microsoft's own continuous sample scores one: mean word accuracy over the reference words (an omitted or substituted word counting 0), the share of reference words read correctly, fluency from the time spent in words over the whole span, mean prosody, and Microsoft's PronScore formula. On the captures, that arithmetic reproduces Azure's own completeness on every single-shot scripted take in a script written with spaces, and its accuracy on all but one, where the word scores averaged exactly 14.5: Azure reported 14, and the arithmetic, which rounds half up, gives 15. The formula reproduces its PronScore on every single-shot take.
- **What is not a probability is left out:** break confidences (`UnexpectedBreak.Confidence` grows with the pause and passes 1; `MissingBreak.Confidence` is 1 on every word without a pause), and a monotone value outside 0..1.
- **What has no name is left out:** outside en-US, Azure names syllables `""`, and outside en-US and zh-CN, phonemes and their candidates. Their scores are kept.
- **An omitted word has no score and no time,** although REST gives it 0, 0 and 0.
- **The output is checked** by lk-core's `validateSpeechAssessment`, so an assessment it returns is one `gradeReadAloud` reads.

## What it refuses

A refusal is never about the take: each is the request, the service or the response. Recording again does not help, so do not ask the learner to.

| `code` | When | What to do |
|---|---|---|
| `five_point_scale` | `gradingSystem: 'FivePoint'` | Send `HundredMark`: FivePoint scores cannot be told from low 0–100 ones |
| `miscue_across_results` | `miscue: true` with more than one result | Continuous recognition does not judge miscues: send it with `miscue: false` |
| `not_a_result` | Not JSON, not an object, or no pronunciation assessment in it | Request the Detailed output format, with the assessment settings applied |
| `recognition_failed` | Any status but `Success`, `NoMatch`, `InitialSilenceTimeout` and `BabbleTimeout` | A provider failure: ask Azure again |
| `invalid_assessment` | lk-core refuses the assessment, with its `errors` | A provider failure, or a malformed response |

## Requesting the assessment

What the captures showed about the request:

- **`GradingSystem: HundredMark`, `Granularity: Phoneme`, the Detailed output format.**
- **Single-shot recognition stops at 30 s, silently**, and reports the rest of the reading as omitted. Choose the mode from the recording's measured length (`inspectWav`), with a margin: single-shot below about 28 s, continuous above.
- **In single-shot recognition, leave the segmentation silence at its default.** With `Speech_SegmentationSilenceTimeoutMs` at 5000, a 7 s pause ended the take.
- **Pass the locale.** The SDK's default is en-US, and the locale does not check the language spoken.

The full appendix, with every finding and the case it rests on, is in [docs/speech-assessment.md](https://github.com/intellectif/learning-kit/blob/main/docs/speech-assessment.md#appendix-filling-speechassessment-from-azure-pronunciation-assessment).

## Stability

The same results and request give the same assessment for the whole of a major version. The captures' assessments are frozen in the tests: a change to what a stored response maps to is a major release.
