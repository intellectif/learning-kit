---
'@intellectif/lk-core': minor
---

**`speaking-response`: a learner answers a prompt out loud, graded on a rubric by a judge on the transcript and by the speech engine's measures**

**Action required:** none. Everything is new; read-aloud grades, written-response grades and stored content are unchanged.

- **The type `speaking-response`**, built in and deferred like `written-response`: a prompt (plain and rich), optional instructions and media (a picture to describe, a recording to answer), a canonical locale with a region, recording bounds, and a rubric whose criteria may name a `measure` — `pronunciation`, `fluency` or `prosody`. A criterion with a measure is scored from the engine; one without, by a judge. The response is a recording, `{ type: 'speaking-response', recording }`, with `recording: null` for a blank. Schema, strict redacted schema, field policy (the rubric is public, `measure` included), JSON Schema, xAPI definition, `createDraft` and seventeen `sr_*` draft checks.
- **Evidence:** `SpeechAssessment.transcript?: { text, source }` — the transcriber's verbatim text of an unscripted take, and who wrote it — which the engine measured the take against and the judge reads. `gradeReadAloud` keeps refusing unscripted evidence (`task_mismatch`).
- **`gradeSpeakingResponse(data, response, { assessment, judgement }, options)`:** each criterion scored once, by the judge (an `AiGradingJudgement` from `checkAiGrading`, or a person's marks in that shape) or from the engine's scores out of 100, unless `judgeMeasures` gives the judge those too; the total by `gradeFromRubric`. A blank is 0. Evidence it cannot tie to the item and the take is refused with `read-aloud`'s codes, plus `judgement_mismatch` for a judgement that does not score each of the judge's criteria exactly once on its 0..1 scale. A judged grade carries the judge's feedback, corrections and identity, and `routeGrade` and `calibrationReport` take the speaking item as their scope.
- **`aiSpeakingGradingRequest`** builds a judge's request (`feature: 'speaking-grading'`): the task, the transcript verbatim, only the criteria the judge scores, and the measured criteria with the engine's scores as context. It builds none for evidence the grade would refuse. `checkAiGrading` accepts it beside a written response's request; `aiGradingRequest` and its facts are unchanged.
- **Vectors:** 58 grade vectors — every refusal, every policy and measurement bound, judge and engine, judged measures, rounding — and the type's validation seed; no existing expectation changed. A mutation sweep of the grade leaves 5 of 121 mutants alive, none of which changes a grade: refusal wording, error wording, a missing measurement thrown as a `TypeError` either way, and an inherited `redacted` marker JSON cannot carry (a unit test pins it).
- **Why a minor:** additive. `SpeechUnscorableCode` gains `judgement_mismatch`, and `BUILT_IN_ACTIVITY_TYPES` gains the type: a TypeScript `switch` or `Record` that is exhaustive over either needs one more entry.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/speech-assessment.md#spoken-answers-19
