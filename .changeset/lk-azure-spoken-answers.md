---
'@intellectif/lk-azure': minor
---

**Spoken answers: `transcriber` reads a take marked against its transcript into unscripted evidence for `gradeSpeakingResponse`**

**Action required:** none for reading a read-aloud take. The lk-core peer range now starts at 1.9.0, whose assessment schema knows the `transcript` field: upgrade lk-core with it.

- **`AzureAssessmentRequest.transcriber?: Grader`** — who wrote `referenceText` when it is the verbatim transcript of a spoken answer rather than an item's text. The assessment then comes back `task: 'unscripted'`, with `transcript: { text: referenceText, source: transcriber }` and no `referenceText`. Single-shot, continuous and silent takes read exactly as a reading's do: only the binding differs.
- **Why a minor:** additive. Without `transcriber`, every result reads as before.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/speech-assessment.md#spoken-answers-19
