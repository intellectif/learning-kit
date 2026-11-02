---
'@intellectif/lk-react': patch
---

**Builds against lk-core 1.9's `speaking-response`, which has no component yet: a question set and a preview show it as a type without a renderer**

**Action required:** none. Draw a spoken answer through `renderers` until `<SpeakingResponse>` ships; nothing else changes. The lk-core peer range now starts at 1.9.0.

- `<ActivitySequence>` and `<ActivityPreview>` show the unsupported-type notice for a `speaking-response`, and a `renderers` entry draws it, as for any type; `<InteractiveVideo>` never holds one, as its timeline refuses the type.
- `<ReadAloud>` shows `judgement_mismatch`, the new spoken-answer code, as it shows the server's other setup refusals: "could not be assessed", with no retake asked for.
