# @intellectif/lk-azure

## 2.0.0

### Major Changes

- [#129](https://github.com/intellectif/learning-kit/pull/129) [`75b661a`](https://github.com/intellectif/learning-kit/commit/75b661a0ced9f2c0c229a9d01438c98e84ca41e4) Thanks [@diego28e](https://github.com/diego28e)! - **A `NoMatch` result is now `no_speech`, not the `no_match` refusal**, so `gradeReadAloud` reports the take as unscorable and the learner can be asked to record again.

  **Action required:** remove `no_match` from anything that lists `AzureRefusalCode`: it is no longer a member, so an exhaustive table naming it stops compiling. A take you sent to a person because of `no_match` now comes back as an assessment with `status: 'no_speech'`; treat it as you treat silence.

  - **Why it is a major:** a stored `NoMatch` response that 1.x refused now maps to an assessment. If you kept `no_match` responses, re-mapping one is a change in what it means: before, no assessment; now, a take `gradeReadAloud` reports as `no_speech`. No grade changes, because a refusal had none. None of the 30 captured responses 1.0.0 was tested on maps differently.
  - **`NoMatch` is speech that matched no word.** Like silence (`InitialSilenceTimeout`), noise (`BabbleTimeout`), and the successful result with every word omitted that Azure sends for both, it leaves nothing of the text to grade, and the learner can record again. In 1.x, it was the one refusal about the take rather than the request, the service or the response, and a host that sent refusals to a person had no person to send it to.
  - **Among the results of a continuous take, a `NoMatch` result adds no words,** as a silent one does.
  - **`AzureRefusalCode`** is now `five_point_scale`, `miscue_across_results`, `not_a_result`, `recognition_failed` and `invalid_assessment`. None is about the take, so recording again does not help with any of them.
  - **A missing prosody score, explained.** Azure leaves `ProsodyScore` out of a take in which it heard no word. Those takes were already `no_speech` in 1.0.0, which `gradeReadAloud` checks before a missing dimension, so on an item that weighs prosody they are not `missing_dimension`. A new test holds this against every captured en-US take that asked for prosody: 24 takes, now including 11 new captures with one, two or four words of the text heard, a hum, Spanish speech and speech under noise. Every take in which Azure heard a word had its prosody score.
  - **Peers on `@intellectif/lk-core` `^1.7.0`,** as before.

  Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-azure/README.md

## 1.0.0

### Major Changes

- [#126](https://github.com/intellectif/learning-kit/pull/126) [`71c30d2`](https://github.com/intellectif/learning-kit/commit/71c30d2df937ca695b070fa72f381666fd5fec27) Thanks [@diego28e](https://github.com/diego28e)! - **`@intellectif/lk-azure`**, a new package: Azure AI Speech pronunciation assessment results, read into lk-core's `SpeechAssessment` by one pure function, built from real captured responses.

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
