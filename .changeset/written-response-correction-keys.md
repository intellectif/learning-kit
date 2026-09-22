---
'@intellectif/lk-react': patch
---

`<WrittenResponse>` gives every inline correction in a returned grade a list key of its own. A grade
that carries the same correction twice — the same mistake made twice in one essay — used to render
both rows under one key. React warns about that, and when the grade re-renders it can drop or
duplicate a row. A correction is now keyed by its `range`, or by its position when it has no range
or repeats one the grader already used. No API changes.
