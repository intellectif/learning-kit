# Features

Everything `@intellectif/lk-core` and `@intellectif/lk-react` support, and the versions each arrived
in. **Since** is the pair where a feature became usable end to end — install at least those. The
two packages are released together: `lk-react` declares `lk-core` as a peer, so each row names both.

What changed in each release, and what to do about it: the [upgrading guide](./upgrading.md) and the
[GitHub Releases](https://github.com/intellectif/learning-kit/releases). What comes next: the
[roadmap](./roadmap.md).

## Activities

| Activity | Since (core / react) | Guide |
|---|---|---|
| **Multiple choice** — single or multiple answers, all-or-nothing or partial credit, per-option feedback, shuffled options | 0.2.0 / 1.0.0 | [Authoring](./authoring.md) |
| A shuffle a server can reproduce (`shuffleSeed`) | 0.3.0 / 2.0.0 | [Authoring](./authoring.md) |
| Options that are a picture or a recording | 0.10.0 / 9.0.0 | [Authoring](./authoring.md) |
| **Fill in the blanks** — per-blank hints, `showCorrectAnswers` | 0.2.0 / 1.0.0 | [Authoring](./authoring.md) |
| Opt-in answer matching: Unicode normalisation, accent folding, typo tolerance | 0.3.0 / 2.0.0 | [Authoring](./authoring.md) |
| **Gap select** — the dropdown cloze, with shared word banks | 0.10.1 / 10.0.0 | [Authoring](./authoring.md) |
| **Written response** — graded later, by your grader, never recorded as a zero | 0.3.0 / 2.0.0 | [Authoring](./authoring.md) |
| A returned grade shown with its criteria and corrections | 0.4.0 / 3.0.0 | [Upgrading](./upgrading.md) |
| **Dictation** — hear a recording, type it; a score for every word | 0.13.0 / 13.0.0 | [Authoring](./authoring.md) |
| **Read-aloud** — record, assess with your speech engine, show the marks | 0.14.0 / 14.0.0 | [Speech assessment](./speech-assessment.md) |
| **Interactive video** — questions at moments of a video (formative only) | 0.15.0 / 15.0.0 | [Interactive video](./interactive-video.md) |
| Two caption languages at once | 0.16.0 / 16.0.0 | [Interactive video](./interactive-video.md) |
| **Your own activity types**, registered once and rendered by the pager | 0.4.0 / 3.0.0 | [Authoring](./authoring.md) |

## Papers, exams and review

| Feature | Since (core / react) | Guide |
|---|---|---|
| `practice`, `exam` and `review` modes; controlled components; rendering a redacted item | 0.3.1 / 2.1.0 | [Upgrading](./upgrading.md) |
| `redact()` — the answer key never reaches an exam client | 0.3.0 / 2.0.0 | [Authoring](./authoring.md) |
| **Question sets** (`<ActivitySequence>`) — one question at a time, keyboard and screen-reader friendly | 0.2.0 / 1.0.0 | [Authoring](./authoring.md) |
| Item groups: a shared passage or recording beside its questions | 0.5.0 / 4.0.0 | [Authoring](./authoring.md) |
| **Attempt plans** — the exact paper a learner sat, checkable at an appeal | 0.6.0 / 5.0.0 | [Upgrading](./upgrading.md) |
| Resuming an interrupted attempt | 0.7.0 / 6.0.0 | [Upgrading](./upgrading.md) |
| Listening papers: a limit on plays, seeking and speed | 0.8.0 / 7.0.0 | [Upgrading](./upgrading.md) |
| A question the host draws itself, counted like the SDK's own — in a video | 0.16.0 / 16.1.0 | [Interactive video](./interactive-video.md) |
| …and in a question set | 0.18.0 / 18.1.0 | [Upgrading](./upgrading.md) |
| **Delivery policies** — what a paper shows: feedback, solutions, hints, AI help | 0.20.0 / 20.0.0 | [Delivery policies](./delivery.md) |

## Grading

| Feature | Since (core / react) | Guide |
|---|---|---|
| `evaluate()` — scored, deferred or unscorable, never an invented zero | 0.3.0 / 2.0.0 | [Upgrading](./upgrading.md) |
| Weighted, sectioned totals with an explicit rounding policy | 0.4.0 / 3.0.0 | [Upgrading](./upgrading.md) |
| Rubric grading from a grader's judgements (`gradeFromRubric`, `GradeRecord`) | 0.4.0 / 3.0.0 | [Upgrading](./upgrading.md) |
| A returned grade whose numbers cannot be a grade is refused | 0.18.0 / 18.0.0 | [Upgrading](./upgrading.md) |
| Grade-stability vectors: every grading path frozen and replayed on each release | 0.8.2 / — | [Vectors](../packages/lk-core/vectors/README.md) |

## Authoring

| Feature | Since (core / react) | Guide |
|---|---|---|
| Drafts that tell unfinished from wrong (`validateDraft`), and `<ActivityPreview>` | 0.9.0 / 8.0.0 | [Authoring](./authoring.md) |
| Drafts for item groups | 0.12.0 / 12.0.0 | [Authoring](./authoring.md) |
| A JSON Schema for every type (`jsonSchemaFor`) | 0.3.0 / — | [Authoring](./authoring.md) |

## AI help (your model, through ports)

| Feature | Since (core / react) | Guide |
|---|---|---|
| **Explanations and hints for learners** — checked before they are shown, never in an exam | 0.17.0 / 17.0.0 | [AI help](./ai.md) |
| The same help in a question you draw yourself (`useAiHints`, `useAiExplanation`) | 0.18.0 / 18.1.0 | [AI help](./ai.md#a-question-you-draw-yourself) |
| What a call cost, refusals you can watch, and a kit to test your prompts in CI | 0.19.0 / 19.0.0 | [AI help](./ai.md#testing-your-prompt) |

## Platform

| Feature | Since (core / react) | Guide |
|---|---|---|
| xAPI 1.0.3 statements, and a validator | 0.2.0 / 1.0.0 | [README](../README.md) |
| Every string the SDK renders is translatable; right-to-left layouts | 0.8.1 / 7.1.0 | [i18n](./i18n.md) |
| Theming tokens and an optional skin | 0.2.0 / 1.0.0 | [Styling](./styling.md) |
| ESM and CommonJS, with types for both | 0.4.0 / 3.0.0 | [README](../README.md) |
| Node 22 or later | 0.11.0 / 11.0.0 | [Upgrading](./upgrading.md) |
