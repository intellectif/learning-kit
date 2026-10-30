---
'@intellectif/lk-azure': major
---

**A `NoMatch` result is now `no_speech`, not the `no_match` refusal**, so `gradeReadAloud` reports the take as unscorable and the learner can be asked to record again.

**Action required:** remove `no_match` from anything that lists `AzureRefusalCode`: it is no longer a member, so an exhaustive table naming it stops compiling. A take you sent to a person because of `no_match` now comes back as an assessment with `status: 'no_speech'`; treat it as you treat silence.

- **Why it is a major:** a stored `NoMatch` response that 1.x refused now maps to an assessment. If you kept `no_match` responses, re-mapping one is a change in what it means: before, no assessment; now, a take `gradeReadAloud` reports as `no_speech`. No grade changes, because a refusal had none. None of the 30 captured responses 1.0.0 was tested on maps differently.
- **`NoMatch` is speech that matched no word.** Like silence (`InitialSilenceTimeout`), noise (`BabbleTimeout`), and the successful result with every word omitted that Azure sends for both, it leaves nothing of the text to grade, and the learner can record again. In 1.x, it was the one refusal about the take rather than the request, the service or the response, and a host that sent refusals to a person had no person to send it to.
- **Among the results of a continuous take, a `NoMatch` result adds no words,** as a silent one does.
- **`AzureRefusalCode`** is now `five_point_scale`, `miscue_across_results`, `not_a_result`, `recognition_failed` and `invalid_assessment`. None is about the take, so recording again does not help with any of them.
- **A missing prosody score, explained.** Azure leaves `ProsodyScore` out of a take in which it heard no word. Those takes were already `no_speech` in 1.0.0, which `gradeReadAloud` checks before a missing dimension, so on an item that weighs prosody they are not `missing_dimension`. A new test holds this against every captured en-US take that asked for prosody: 24 takes, now including 11 new captures with one, two or four words of the text heard, a hum, Spanish speech and speech under noise. Every take in which Azure heard a word had its prosody score.
- **Peers on `@intellectif/lk-core` `^1.7.0`,** as before.

Guide: https://github.com/intellectif/learning-kit/blob/main/packages/lk-azure/README.md
