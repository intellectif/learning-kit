---
'@intellectif/lk-practice': minor
---

**`@intellectif/lk-practice`: one review per sitting, steadier mastery, mastery checks that back off, and leeches that only flag real trouble**

**Action required:** rebuild stored states. The configuration hash now includes the version of the rules that apply an entry to the state, so a state saved by 0.2 is refused with `STATE_CONFIG_MISMATCH`; `replay` the learner's log (or `replayFrom` an older checkpoint) and store the new state. Logs are unchanged and stay valid.

- **One sitting is one review:** a success within `reviewGapMs` (1 hour) of a skill stage's last review, before it is due, moves the ability but not the memory or the stage. A failure always counts. `reviewGapMs: 0` reviews every success.
- **Mastery holds with a margin:** the expected success of 0.80 must hold against the reference difficulty raised by `mastery.uncertaintyMargin` (0.5) times the ability's uncertainty, which shrinks as evidence grows. `uncertaintyMargin: 0` drops it.
- **Mastery checks alternate and back off:** after a failed check or a lapse, the next review is at the learner's level; each failed check in a row doubles the wait for the next (72 hours, then 6 days, then 12). The state records the count as `top.failedChecks` (read as 0 in older states).
- **Leeches:**
  - flagged on a lapse only, so a success right after unsuspending no longer suspends the skill again;
  - flagged again every half threshold;
  - flagged only while the skill fails at least twice as often as the planner aims for, since practice at the target fails 15% of the time by design.
- **`./testing`:** `consolidation` gives the simulated learner a memory that grows with spaced successes; the default 0 keeps the forgetting time fixed, as before.

On a simulated learner, the share mastered within a year at an expected success of 0.82 rose from 11 of 20 to 17 of 20. Learners at 0.62 and below stayed almost never mastered, and none was suspended.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md
