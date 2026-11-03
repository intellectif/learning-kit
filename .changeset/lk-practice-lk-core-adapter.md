---
'@intellectif/lk-practice': minor
---

**`@intellectif/lk-practice/lk-core`: lk-core outcomes become practice evidence, with rubric criteria as per-skill outcomes**

**Action required:** none. A new entry point; nothing else changes, and lk-core stays optional: the entry imports nothing from it.

- `evidenceFromOutcome(outcome, item, meta)` turns the outcome lk-core's `evaluate` returns into evidence:
  - `scored` as an `auto` grade;
  - `graded` by its grader, with its confidence and review flag, and its rubric criteria as per-skill outcomes through the item's `criteria`;
  - a grade still owed (awaiting a person, async grading, or a re-grade) is held until the grade arrives with `confirms`; a person's own grade is never held;
  - `null` for an unscorable or never-answered item, since nothing was attempted.
- `skillOutcomesFromCriteria(criteria, item)` gives the per-skill outcomes alone: criteria not applicable or without a score are skipped, and those bound to one skill are summed.
- Its types copy the lk-core shapes it reads; a test against the real lk-core keeps them in step.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md#outcomes-from-lk-core
