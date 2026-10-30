---
'@intellectif/lk-azure': major
---

**`@intellectif/lk-azure`**, a new package: Azure AI Speech pronunciation assessment results, read into lk-core's `SpeechAssessment` by one pure function, built from real captured responses.

**Action required:** none. It is a new package, so nothing changes until you install it; it is a major only because its first version is 1.0.0. If you read Azure's results with your own code, compare it with the rules below, which real responses showed and which change grades.

- **`assessmentFromAzure(results, request)`** takes every result of a take, as the Speech SDK's `SpeechServiceResponse_JsonResult` or a REST body (text or parsed), and the settings you sent. It returns the assessment, checked by `validateSpeechAssessment`, or a refusal with a `code`. No network, no key, no Azure SDK.
- **Nothing heard is `no_speech`.** Azure answers silence and background noise alike with a successful result in which every reference word is omitted. Mapped as it stands, a noisy take is graded 0.
- **Break confidences are left out.** They are not probabilities: one passed 7 on a real pause, and lk-core refuses a confidence above 1.
- **Names Azure leaves empty are left out:** syllables outside en-US, and phonemes and their candidates outside en-US and zh-CN, which Azure names `""`. Their scores are kept.
- **An omitted word has no score and no time**, although REST gives it 0, 0 and 0.
- **A take of several results is scored over the whole take**, as Microsoft's own continuous sample scores one, so a pause between segments is charged as single-shot recognition charges it. One result keeps Azure's scores.
- **Refusals:** `five_point_scale`, `miscue_across_results`, `not_a_result`, `no_match` (a re-record, not a retry), `recognition_failed`, and `invalid_assessment` with lk-core's `errors`.
- **Peers on `@intellectif/lk-core` `^1.7.0`.** A lk-core minor or patch releases no lk-azure.

Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-azure/README.md
