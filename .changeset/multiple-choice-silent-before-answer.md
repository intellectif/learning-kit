---
"@intellectif/lk-react": patch
---

**Multiple choice under `feedback: false`**: no longer says "Answer submitted." before the learner has answered.

**Action required:** none.

- With `delivery={{ feedback: false }}`, a `<MultipleChoice>` announced "Answer submitted." in its live region as soon as it rendered. It now says nothing until the learner submits, as every other activity component does; after a submit it still says only that the answer was received.
- **Built with tsdown**, as tsup is no longer maintained. Every entry point exports the same names in ESM and CommonJS, each module still starts with `'use client'`, and the declarations describe the same API; only the names of the internal chunk files differ.
- A new test walks all six activity components through the same moment, in practice and exam mode, under every delivery policy, so a component that drifts from the others fails by name.
