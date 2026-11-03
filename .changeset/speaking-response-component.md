---
'@intellectif/lk-react': minor
---

**`<SpeakingResponse>`: a learner answers a prompt out loud, and reads the grade, each criterion, the corrections and the transcript of what they said**

**Action required:** none. A question set or a preview that showed a `speaking-response` as a type without a renderer now draws it; a `renderers` entry for the type still wins.

- **`<SpeakingResponse>`** (`@intellectif/lk-react/components/SpeakingResponse`): the prompt (`promptHtml` through `sanitizeHtml`), the picture or recording, how long an answer may be, and `<ReadAloud>`'s recorder — the same take machinery, now shared: `recordingBinding.upload` required outside `review`, a retry of whichever step failed, the microphone released when a pane hides, an item recording kept silent while the learner speaks, and a host's grade read rather than trusted.
- **`SpeakingAssessResult`:** what `assess` returns — `<ReadAloud>`'s results, and `pending` for an answer a person will grade (`routeGrade` sent it to one): the learner is told it is in and waits, and `onComplete` is not called.
- **Under a grade:** the score and the grader's feedback, each criterion with its level or percentage and the judge's comment, the corrections, and the transcript. In `review`, from the stored `outcome` and the kept `assessment`; never in `exam`.
- **In a question set,** the paper's `recordingBinding` serves read-aloud and spoken-answer slots alike: `SequenceRecordingBinding.assess` may return `pending`, which a read-aloud reads as a judgement with no grade, as it always has. `RecordingBinding` takes the type `assess` returns, defaulting to `ReadAloudAssessResult`.
- **Six strings** (`speakingTimeLimit`, `speakingAssessing`, `speakingAssessmentUnavailable`, `speakingAssessmentFailed`, `speakingTranscript`, `speakingCorrections`); the recorder's are the read-aloud ones.
- **Why a minor:** additive. `<ReadAloud>` and `<WrittenResponse>` render and report exactly as before; their take machinery and their grade breakdown are now shared code.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/speech-assessment.md#in-the-browser-speakingresponse
