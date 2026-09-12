---
'@intellectif/lk-core': minor
'@intellectif/lk-react': major
---

Authoring: tell an unfinished question from a wrong one.

`validateActivity` answers "may this be stored?", and to that question a question an author added a second ago and a broken one get the same answer. An editor that used it as its only check reported every new question as an error — enough to disable a whole form's Save button and blank its preview.

**lk-core**

- `validateDraft(type, draft)` returns `{ status: 'complete', data, issues: [] }` or `{ status: 'incomplete' | 'invalid', issues }`. Each issue is a `ValidationError` plus a `severity`, at the paths `validateActivity` reports. Its `code` is documented per type in the authoring guide for every problem the checks recognise; anything else is the schema's own diagnostic, at `invalid`. There is deliberately no `success` boolean, which would have to call an incomplete draft either a success or a failure.
- It is stricter than `validateActivity` and never looser. It reports a title or option text that is only whitespace, a blank written-response `prompt` even beside `promptHtml`, a rubric criterion name that is only whitespace, a rubric whose weights are all 0 or add up to more than a number can hold, a fill-in-the-blanks match `locale` that is not a language tag (scoring would throw on it), and `redacted: true`. A `null` in a required field reads as not set; any other `null` the schema refuses is `null_not_allowed`, for every registered type. It does not report `minWords: 0`, which means no lower limit, or a rubric weight above 1.
- `createDraft(type, { newId })` returns an empty draft that `validateDraft` reports as `incomplete`. It invents no ids, and a new multiple-choice draft marks no option correct, so an untouched correctness control can never become an answer key.
- `ActivityTypeDescriptor.authoring` — `createDraft` and `checkDraft` — gives a registered type the same support. The three built-in descriptors carry one.

**lk-react**

- `<ActivityPreview>`, also at `@intellectif/lk-react/components/ActivityPreview`, renders a draft in any `renderMode` with a simulated `response` — marked with `evaluate()` in `review` — and renders a notice, or your `fallback` with the issues, while the draft is not complete. Nothing it renders is recorded, and a recording's play limit is enforced in memory in `practice` and `exam`. It checks the draft by content on every render, whatever order its keys are in, so an editor that rebuilds or reloads its payload does not restart the question being tried.
- `LkStrings` gains `previewIncomplete` and `previewInvalid`. A dictionary declared as a complete `LkStrings` must add both; partial overrides are unaffected.

Nothing that already exists changes behaviour in either package. lk-react's major version comes from its lk-core peer range.
