---
'@intellectif/lk-react': minor
---

**`<ReadAloud>` no longer asks for another take that cannot help**: a take refused for the server's setup now says "Your pronunciation could not be checked."

**Action required:** none. If you translate `readAloudAssessmentFailed`, check that your sentence also fits a take refused for the server's setup, where it now shows too. A code of your own that no take can fix still asks for another take; return it as `{ status: 'failed', retryable }` instead.

- **What changed.** An unscorable result with `invalid_assessment`, `task_mismatch`, `locale_mismatch`, `reference_mismatch`, `recording_mismatch`, `assessor_not_accepted` or `missing_dimension` said "This recording could not be assessed. Try recording it again." The next take gets the same refusal until the server or the item is fixed, so a learner who followed that advice used up takes for nothing. These codes now show `readAloudAssessmentFailed` and ask for no new take. Another take is still offered while one remains.
- **Unchanged:** `no_speech` and `insufficient_voiced_time` still show `readAloudNotHeard`, and `implausible_speech_rate` and any code the SDK does not name still show `readAloudNotAssessed`. No key is added, no default is reworded, and the `assessment-failed` event is the same.
- **Why a minor:** what a learner reads changes for seven codes.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/speech-assessment.md#recording-a-take-readaloud
