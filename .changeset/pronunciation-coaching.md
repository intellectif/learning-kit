---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

**Coaching on a reading aloud**: "Coach me on this reading" under a read-aloud's marks, where a model may coach only the words the speech engine marked.

**Action required:** none unless your code switches over `AiFeature`, `AiRefusal` or `InteractionKind` without a `default` branch (new members `'pronunciation-coaching'`, `'contradicts-marks'` and `'ai-coaching-shown'`), reads `AiCheckCase.request` without narrowing on `feature`, or implements a complete `LkStrings` (six new keys). Nothing changes until you pass a `pronunciationCoaching` port. Install lk-core 1.1.0 with lk-react 23.1.0: lk-react calls the new lk-core functions, and its peer range moves to `^1.1.0`. See https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md

- **lk-core:** `aiCoachingRequest` builds what a model is given: the text, the engine's marks word by word — with each word's sounds and what each was heard as, when the marks come from the assessment — its dimension scores, and the grade. `checkAiCoaching` checks the reply before a learner sees it. Every word it coaches must be one the engine marked mispronounced or omitted, and every sound one the engine reported for that word; anything else refuses the whole reply as `contradicts-marks`. The words come back in reading order, each as the marks show it, and no number in the reply is read. An assessment the grader would not read (no speech, unscripted, another text or locale) gives no coaching.
- **lk-react:** a `pronunciationCoaching` port on `LearnerAi`. `<ReadAloud>` offers coaching under its marks in `practice` once a take is graded and in `review` wherever marks are shown, from a kept assessment or a stored grade; never in `exam`. `<PronunciationFeedback>` offers it too, given the item's `id` and `title` in `data`, and takes `ai`, `renderMode`, `delivery` and `onInteraction` for it. It follows the author's and the paper's `ai.explanations` and needs `feedback`, not `solutions`. One coaching per take. `useAiCoaching` gives marks you draw yourself the same rules.
- **Records:** `ai-coaching-shown` (how many words were coached, provenance and usage; never the text), and `ai-help-refused` with `feature: 'pronunciation-coaching'`.
- **ai-check:** a `pronunciationCoaching` port runs four reading cases: a mispronounced "th" and a word left out, a clean reading, the same slips from a stored grade without sounds, and coaching asked for in Spanish.
- Six new strings: `aiCoaching`, `aiCoachingLoading`, `aiCoachingHeading`, `aiCoachingUnavailable`, `aiCoachingWords`, `aiCoachingSound`.
- **Stability:** the promise now says what a minor may add to a type the SDK hands you — a union member, a `LkStrings` key, an optional property — and that a `default` branch keeps a switch correct across minors.
